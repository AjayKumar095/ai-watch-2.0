const {
  User,
  TeacherProfile,
  StudentProfile,
  Program,
  Specialization,
  ApprovalRequest,
  RefreshToken,
} = require("../models");
const { hashPassword, verifyPassword } = require("../utils/password");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  COOKIE_OPTS,
} = require("../utils/jwt");

const DASHBOARD_BY_ROLE = {
  SUPERADMIN: "/admin/dashboard",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/dashboard",
};

exports.showLogin = (req, res) => {
  res.render("auth/login", { title: "Login", error: null });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).render("auth/login", {
      title: "Login",
      error: "Invalid email or password.",
    });
  }

  if (!user.isActive) {
    return res.status(403).render("auth/login", {
      title: "Login",
      error:
        user.role === "STUDENT"
          ? "Your account is awaiting teacher approval. You'll get an email once it's approved."
          : "Your account isn't active yet. Contact the administrator.",
    });
  }

  await issueSession(user, res);
  res.redirect(DASHBOARD_BY_ROLE[user.role] || "/");
};

async function issueSession(user, res) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
  res.cookie("refresh_token", refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

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
    stored.revokedAt = new Date();
    await stored.save();
    await issueSession(user, res);

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
  const programs = await Program.findAll({ where: { isActive: true }, include: [Specialization] });
  const teachers = await TeacherProfile.findAll({ include: [User] });
  res.render("auth/signup", { title: "Student Onboarding", programs, teachers, error: null, formData: {} });
};

exports.studentSignup = async (req, res) => {
  const { email, firstName, lastName, password, rollNo, programId, specializationId, requestedTeacherId } = req.body;

  const programs = await Program.findAll({ where: { isActive: true }, include: [Specialization] });
  const teachers = await TeacherProfile.findAll({ include: [User] });
  const rerender = (error) =>
    res.status(400).render("auth/signup", { title: "Student Onboarding", programs, teachers, error, formData: req.body });

  if (!email || !firstName || !lastName || !password || !rollNo || !programId || !requestedTeacherId) {
    return rerender("Please fill in all required fields.");
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) return rerender("An account with this email already exists.");

  const existingRoll = await StudentProfile.findOne({ where: { rollNo } });
  if (existingRoll) return rerender("This roll number is already registered.");

  const passwordHash = await hashPassword(password);

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
    currentSemesterNumber: 1,
    isVerified: false,
  });

  await ApprovalRequest.create({
    studentId: studentProfile.id,
    requestedTeacherId,
    status: "PENDING",
  });

  res.render("auth/signup-success", { title: "Request Submitted" });
};
