const {
  User,
  TeacherProfile,
  StudentProfile,
  School,
  Program,
  Specialization,
  ApprovalRequest,
  RefreshToken,
} = require("../models");
const { distinctAdmissionYears, getActiveAcademicYears, getDefaultAcademicYear } = require("../services/admissionYearService");
const { sectionsFor } = require("../services/sectionLookupService");
const { hashPassword, verifyPassword, generateTempPassword } = require("../utils/password");
const {
  notifySignupReceived,
  notifyPasswordReset,
} = require("../services/notificationService");
const {
  verifyRefreshToken,
  hashToken,
  COOKIE_OPTS,
} = require("../utils/jwt");
const { issueSession, rotateSession } = require("../services/sessionService");
const logger = require("../utils/logger");

const DASHBOARD_BY_ROLE = {
  SUPERADMIN: "/admin/dashboard",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/dashboard",
};

exports.showLogin = (req, res) => {
  // A logged-in user landing on /login (stale bookmark, back button, a
  // session that's still valid, etc.) should never see the login form
  // rendered inside their own authenticated layout — send them straight
  // to their dashboard instead.
  if (req.currentUser) {
    return res.redirect(DASHBOARD_BY_ROLE[req.currentUser.role] || "/");
  }
  res.render("auth/login", { title: "Login", error: null });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });

  if (!user) {
    logger.warn("Login failed: unknown email", { email });
    return res.status(401).render("auth/login", {
      title: "Login",
      error: "Invalid email or password.",
    });
  }

  // Checked before the password: a newly-signed-up student has a
  // system-assigned password they don't know yet (it's emailed on
  // approval), so they'd never be able to pass a password check anyway.
  // Showing the real reason here (instead of "invalid email or password")
  // avoids a confusing dead end while they're waiting on approval.
  if (!user.isActive) {
    return res.status(403).render("auth/login", {
      title: "Login",
      error:
        user.role === "STUDENT"
          ? "Your account is awaiting teacher approval. You'll get an email once it's approved."
          : "Your account isn't active yet. Contact the administrator.",
    });
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    logger.warn("Login failed: wrong password", { email, userId: user.id });
    return res.status(401).render("auth/login", {
      title: "Login",
      error: "Invalid email or password.",
    });
  }

  await issueSession(user, res);
  res.redirect(DASHBOARD_BY_ROLE[user.role] || "/");
};

exports.refresh = async (req, res) => {
  const token = req.cookies && req.cookies.refresh_token;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    const payload = verifyRefreshToken(token);
    const stored = await RefreshToken.findOne({ where: { tokenHash: hashToken(token) } });
    if (!stored || stored.revokedAt) throw new Error("Refresh token revoked/unknown");

    const user = await User.findByPk(payload.sub);
    if (!user || !user.isActive) throw new Error("User inactive");

    // Rotate: revoke the old refresh token, issue a new pair.
    await rotateSession(stored, user, res);

    res.json({ ok: true });
  } catch (err) {
    res.clearCookie("access_token", COOKIE_OPTS);
    res.clearCookie("refresh_token", COOKIE_OPTS);
    res.status(401).json({ error: "Session expired, please log in again" });
  }
};

exports.logout = async (req, res) => {
  const token = req.cookies && req.cookies.refresh_token;
  if (token) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie("access_token", COOKIE_OPTS);
  res.clearCookie("refresh_token", COOKIE_OPTS);
  res.redirect("/login");
};

// --- Student onboarding -----------------------------------------------------

exports.showStudentSignup = async (req, res) => {
  if (req.currentUser) {
    return res.redirect(DASHBOARD_BY_ROLE[req.currentUser.role] || "/");
  }

  const [schools, teachers, years, academicYears, defaultYear] = await Promise.all([
    School.findAll({ where: { isActive: true }, order: [["name", "ASC"]] }),
    TeacherProfile.findAll({ include: [User] }),
    distinctAdmissionYears(),
    getActiveAcademicYears(),
    getDefaultAcademicYear(),
  ]);
  res.render("auth/signup", {
    title: "Student Onboarding",
    schools,
    teachers,
    years,
    academicYears,
    defaultYear: defaultYear ? defaultYear.admissionYear : null,
    error: null,
    formData: {},
  });
};

// Public JSON endpoints powering the School -> Program -> Specialization
// cascading dropdowns on the signup form (no auth — the form is filled out
// before the student has an account).
exports.programsForSchool = async (req, res) => {
  const programs = await Program.findAll({
    where: { schoolId: req.params.schoolId, isActive: true },
    order: [["name", "ASC"]],
    attributes: ["id", "name", "totalSemesters"],
  });
  res.json(programs);
};

exports.specializationsForProgram = async (req, res) => {
  const specializations = await Specialization.findAll({
    where: { programId: req.params.programId, isActive: true },
    order: [["name", "ASC"]],
    attributes: ["id", "name"],
  });
  res.json(specializations);
};

// New admits always start at semester 1, so this looks up that specific
// ProgramOffering for the chosen program+admissionYear and returns its
// top-level sections with sub-groups nested — an empty array is a normal,
// expected result if admin hasn't set up sections for that year yet (the
// form treats that as "pick one later," not an error).
exports.sectionsForProgram = async (req, res) => {
  const { programId, admissionYear, semesterNumber: paramSem } = req.params;
  const semesterNumber = parseInt(paramSem || req.query.semesterNumber || 1, 10);
  const sections = await sectionsFor({
    programId,
    admissionYear: parseInt(admissionYear, 10),
    semesterNumber,
  });
  res.json(sections);
};

exports.studentSignup = async (req, res) => {
  const {
    email, firstName, lastName, rollNo, schoolId, programId, specializationId,
    admissionYear, semesterNumber, sectionId, subGroupId, requestedTeacherId,
  } = req.body;

  const [schools, teachers, years, academicYears, defaultYear] = await Promise.all([
    School.findAll({ where: { isActive: true }, order: [["name", "ASC"]] }),
    TeacherProfile.findAll({ include: [User] }),
    distinctAdmissionYears(),
    getActiveAcademicYears(),
    getDefaultAcademicYear(),
  ]);
  const rerender = (error) =>
    res.status(400).render("auth/signup", {
      title: "Student Onboarding",
      schools,
      teachers,
      years,
      academicYears,
      defaultYear: defaultYear ? defaultYear.admissionYear : null,
      error,
      formData: req.body,
    });

  if (!email || !firstName || !lastName || !rollNo || !schoolId || !programId || !admissionYear || !requestedTeacherId) {
    return rerender("Please fill in all required fields.");
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) return rerender("An account with this email already exists.");

  const existingRoll = await StudentProfile.findOne({ where: { rollNo } });
  if (existingRoll) return rerender("This roll number is already registered.");

  const requestedTeacher = await TeacherProfile.findOne({ where: { id: requestedTeacherId }, include: [User] });
  if (!requestedTeacher) return rerender("Please select a valid teacher to review your request.");

  // No password field on this form on purpose: the account's real password
  // is a system-generated one, sent by email once a teacher approves (see
  // teacherController.approveRequest). This hash is just a random,
  // never-disclosed placeholder so the column isn't left empty — login is
  // blocked anyway while isActive is false (see authController.login).
  const passwordHash = await hashPassword(generateTempPassword());

  const user = await User.create({
    email,
    firstName,
    lastName,
    passwordHash,
    role: "STUDENT",
    isActive: false, // activated once the requested teacher approves
  });

  const studentProfile = await StudentProfile.create({
    userId: user.id,
    rollNo,
    programId,
    specializationId: specializationId || null,
    admissionYear: parseInt(admissionYear, 10),
    currentSectionId: subGroupId || sectionId || null,
    currentSemesterNumber: parseInt(semesterNumber, 10) || 1,
    isVerified: false,
  });

  await ApprovalRequest.create({
    studentId: studentProfile.id,
    requestedTeacherId,
    status: "PENDING",
  });

  notifySignupReceived({ studentUser: user, teacherName: requestedTeacher.User.fullName() });

  res.render("auth/signup-success", { title: "Request Submitted" });
};

// --- Forgot password ---------------------------------------------------------

exports.showForgotPassword = (req, res) => {
  if (req.currentUser) {
    return res.redirect(DASHBOARD_BY_ROLE[req.currentUser.role] || "/");
  }
  res.render("auth/forgot-password", { title: "Forgot Password", error: null, submitted: false });
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).render("auth/forgot-password", { title: "Forgot Password", error: "Please enter your email.", submitted: false });
  }

  const user = await User.findOne({ where: { email } });

  // Always show the same "check your email" message whether or not the
  // account exists — avoids leaking which emails are registered.
  if (user && user.isActive) {
    const tempPassword = generateTempPassword();
    user.passwordHash = await hashPassword(tempPassword);
    await user.save();
    notifyPasswordReset({ user, tempPassword });
  }

  res.render("auth/forgot-password", { title: "Forgot Password", error: null, submitted: true });
};
