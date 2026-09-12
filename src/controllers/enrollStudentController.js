const { parse } = require("csv-parse/sync");
const {
  User,
  StudentProfile,
  Program,
  School,
  Specialization,
  Section,
  SubjectOffering,
  SubjectPool,
  ApprovalRequest,
  AuditLog,
} = require("../models");
const { hashPassword, generateTempPassword } = require("../utils/password");
const { notifyApprovalDecision } = require("../services/notificationService");
const { enrollStudentInOfferings } = require("../services/enrollmentService");
const { getActiveAcademicYears, getDefaultAcademicYear } = require("../services/admissionYearService");
const { STUDENT_EMAIL_DOMAIN, ROLL_NO_LENGTH, isValidStudentEmail, isValidRollNo } = require("../utils/studentValidation");
const logger = require("../utils/logger");

function getBreadcrumbs(req, label) {
  const isTeacher = req.currentUser.role === "TEACHER";
  const base = isTeacher ? { label: "Dashboard", url: "/teacher/dashboard" } : { label: "Dashboard", url: "/admin/dashboard" };
  return [base, { label }];
}

function parseCsvContent(content) {
  let records;
  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    const lines = content.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes("email") || firstLine.includes("roll");
    const dataLines = hasHeader ? lines.slice(1) : lines;
    records = dataLines.map((line) => {
      const parts = line.split(",").map((s) => (s || "").trim());
      return {
        email: parts[0] || "",
        rollNo: parts[1] || "",
        firstName: parts[2] || "",
        lastName: parts[3] || "",
      };
    });
  }

  // Normalize column names to lowercase/trimmed keys
  return records.map((r) => {
    const normalized = {};
    for (const [key, val] of Object.entries(r)) {
      const k = key.toLowerCase().replace(/[\s_-]/g, "");
      normalized[k] = (val || "").trim();
    }
    return {
      email: normalized.email || "",
      rollNo: normalized.rollno || normalized.roll || normalized.rollnumber || "",
      firstName: normalized.firstname || normalized.first || normalized.name || "",
      lastName: normalized.lastname || normalized.last || "",
    };
  });
}

exports.showEnrollPage = async (req, res) => {
  const isTeacher = req.currentUser.role === "TEACHER";
  const basePath = isTeacher ? "/teacher" : "/admin";

  const [programs, academicYears, defaultYear, offerings] = await Promise.all([
    Program.findAll({
      where: { isActive: true },
      include: [School],
      order: [["name", "ASC"]],
    }),
    getActiveAcademicYears(),
    getDefaultAcademicYear(),
    isTeacher
      ? []
      : SubjectOffering.findAll({
          where: { isActive: true },
          include: [SubjectPool, Program],
          order: [["createdAt", "DESC"]],
        }),
  ]);

  const activeTab = req.query.tab || "single";

  res.render("admin/enroll", {
    title: "Enroll Students",
    basePath,
    isTeacher,
    programs,
    academicYears,
    defaultYear: defaultYear ? defaultYear.admissionYear : new Date().getFullYear(),
    offerings,
    activeTab,
    result: null,
    bulkResult: null,
    breadcrumbs: getBreadcrumbs(req, "Enroll Students"),
  });
};

exports.singleEnroll = async (req, res) => {
  const isTeacher = req.currentUser.role === "TEACHER";
  const basePath = isTeacher ? "/teacher" : "/admin";

  const {
    firstName,
    lastName,
    email,
    rollNo,
    programId,
    specializationId,
    admissionYear,
    semesterNumber,
    sectionId,
    subGroupId,
  } = req.body;

  if (!email || !rollNo || !programId || !admissionYear) {
    req.flash("error", "Please fill in all required fields (Email, Roll No, Program, Admission Year).");
    return res.redirect(`${basePath}/enroll?tab=single`);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRoll = rollNo.trim();

  if (!isValidStudentEmail(normalizedEmail)) {
    req.flash("error", `Email must be a university address ending in ${STUDENT_EMAIL_DOMAIN}.`);
    return res.redirect(`${basePath}/enroll?tab=single`);
  }

  if (!isValidRollNo(normalizedRoll)) {
    req.flash("error", `Roll number must be exactly ${ROLL_NO_LENGTH} characters (got ${normalizedRoll.length}).`);
    return res.redirect(`${basePath}/enroll?tab=single`);
  }

  // Validate uniqueness
  const existingUser = await User.findOne({ where: { email: normalizedEmail } });
  if (existingUser) {
    req.flash("error", `A user with email "${normalizedEmail}" already exists.`);
    return res.redirect(`${basePath}/enroll?tab=single`);
  }

  const existingStudent = await StudentProfile.findOne({ where: { rollNo: normalizedRoll } });
  if (existingStudent) {
    req.flash("error", `A student with roll number "${normalizedRoll}" is already registered.`);
    return res.redirect(`${basePath}/enroll?tab=single`);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const finalFirstName = firstName && firstName.trim() ? firstName.trim() : normalizedEmail.split("@")[0];
  const finalLastName = lastName && lastName.trim() ? lastName.trim() : "Student";

  const user = await User.create({
    email: normalizedEmail,
    firstName: finalFirstName,
    lastName: finalLastName,
    passwordHash,
    role: "STUDENT",
    isActive: true,
  });

  const studentProfile = await StudentProfile.create({
    userId: user.id,
    rollNo: normalizedRoll,
    programId,
    specializationId: specializationId || null,
    admissionYear: parseInt(admissionYear, 10),
    currentSemesterNumber: parseInt(semesterNumber, 10) || 1,
    currentSectionId: subGroupId || sectionId || null,
    isVerified: true,
    status: "ACTIVE",
  });

  await ApprovalRequest.create({
    studentId: studentProfile.id,
    status: "APPROVED",
    decidedByUserId: req.currentUser.id,
    decidedAt: new Date(),
    note: `Directly enrolled by ${req.currentUser.role}`,
  });

  // Auto-enroll in subject offerings matching this class/section
  let enrolledOfferingsCount = 0;
  if (studentProfile.currentSectionId) {
    try {
      const enrollRes = await enrollStudentInOfferings(studentProfile);
      enrolledOfferingsCount = enrollRes.enrolledCount;
    } catch (err) {
      logger.error("Error auto-enrolling student on singleEnroll", { error: err.message });
    }
  }

  notifyApprovalDecision({
    studentUser: user,
    rollNo: studentProfile.rollNo,
    decision: "APPROVED",
    decidedByName: req.currentUser.fullName ? req.currentUser.fullName() : req.currentUser.firstName,
    tempPassword,
  });

  await AuditLog.create({
    userId: req.currentUser.id,
    action: "DIRECT_ENROLL_STUDENT",
    entityType: "StudentProfile",
    entityId: studentProfile.id,
    details: { rollNo: normalizedRoll, email: normalizedEmail, programId },
  });

  req.flash(
    "success",
    `Student ${finalFirstName} ${finalLastName} (${normalizedRoll}) enrolled successfully! Enrolled in ${enrolledOfferingsCount} subject offerings. Temp password: ${tempPassword}`
  );
  res.redirect(`${basePath}/enroll?tab=single`);
};

exports.bulkEnroll = async (req, res) => {
  const isTeacher = req.currentUser.role === "TEACHER";
  const basePath = isTeacher ? "/teacher" : "/admin";

  const {
    programId,
    specializationId,
    admissionYear,
    semesterNumber,
    sectionId,
    subGroupId,
    csvText,
  } = req.body;

  if (!programId || !admissionYear) {
    req.flash("error", "Please select a Program and Admission Year for the batch.");
    return res.redirect(`${basePath}/enroll?tab=bulk`);
  }

  const rawContent = req.file ? req.file.buffer.toString("utf-8") : csvText;
  if (!rawContent || !rawContent.trim()) {
    req.flash("error", "Please upload a CSV file or paste CSV content.");
    return res.redirect(`${basePath}/enroll?tab=bulk`);
  }

  const rows = parseCsvContent(rawContent);
  if (!rows.length) {
    req.flash("error", "No records found in CSV. Please verify the format.");
    return res.redirect(`${basePath}/enroll?tab=bulk`);
  }

  const created = [];
  const skipped = [];
  const assignedSectionId = subGroupId || sectionId || null;
  const semNum = parseInt(semesterNumber, 10) || 1;
  const admYear = parseInt(admissionYear, 10);

  for (const row of rows) {
    const email = (row.email || "").trim().toLowerCase();
    const rollNo = (row.rollNo || "").trim();

    if (!email || !rollNo) {
      skipped.push({ email: email || "(blank)", rollNo: rollNo || "(blank)", reason: "Missing email or roll number" });
      continue;
    }

    if (!isValidStudentEmail(email)) {
      skipped.push({ email, rollNo, reason: `Invalid email — must end with ${STUDENT_EMAIL_DOMAIN}` });
      continue;
    }

    if (!isValidRollNo(rollNo)) {
      skipped.push({ email, rollNo, reason: `Roll number must be exactly ${ROLL_NO_LENGTH} characters (got ${rollNo.length})` });
      continue;
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      skipped.push({ email, rollNo, reason: "Email already registered" });
      continue;
    }

    const existingStudent = await StudentProfile.findOne({ where: { rollNo } });
    if (existingStudent) {
      skipped.push({ email, rollNo, reason: "Roll number already registered" });
      continue;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const firstName = row.firstName || email.split("@")[0];
    const lastName = row.lastName || "Student";

    const user = await User.create({
      email,
      firstName,
      lastName,
      passwordHash,
      role: "STUDENT",
      isActive: true,
    });

    const studentProfile = await StudentProfile.create({
      userId: user.id,
      rollNo,
      programId,
      specializationId: specializationId || null,
      admissionYear: admYear,
      currentSemesterNumber: semNum,
      currentSectionId: assignedSectionId,
      isVerified: true,
      status: "ACTIVE",
    });

    await ApprovalRequest.create({
      studentId: studentProfile.id,
      status: "APPROVED",
      decidedByUserId: req.currentUser.id,
      decidedAt: new Date(),
      note: `Bulk enrolled by ${req.currentUser.role}`,
    });

    let offeringsCount = 0;
    if (assignedSectionId) {
      try {
        const enrollRes = await enrollStudentInOfferings(studentProfile);
        offeringsCount = enrollRes.enrolledCount;
      } catch (err) {
        logger.error("Error auto-enrolling student in bulkEnroll", { rollNo, error: err.message });
      }
    }

    notifyApprovalDecision({
      studentUser: user,
      rollNo,
      decision: "APPROVED",
      decidedByName: req.currentUser.fullName ? req.currentUser.fullName() : req.currentUser.firstName,
      tempPassword,
    });

    created.push({
      email,
      rollNo,
      name: `${firstName} ${lastName}`,
      tempPassword,
      offeringsCount,
    });
  }

  await AuditLog.create({
    userId: req.currentUser.id,
    action: "BULK_ENROLL_STUDENTS",
    entityType: "StudentProfile",
    entityId: "bulk",
    details: {
      programId,
      admissionYear: admYear,
      semesterNumber: semNum,
      createdCount: created.length,
      skippedCount: skipped.length,
    },
  });

  const [programs, academicYears, defaultYear, offerings] = await Promise.all([
    Program.findAll({
      where: { isActive: true },
      include: [School],
      order: [["name", "ASC"]],
    }),
    getActiveAcademicYears(),
    getDefaultAcademicYear(),
    isTeacher
      ? []
      : SubjectOffering.findAll({
          where: { isActive: true },
          include: [SubjectPool, Program],
          order: [["createdAt", "DESC"]],
        }),
  ]);

  res.render("admin/enroll", {
    title: "Enroll Students",
    basePath,
    isTeacher,
    programs,
    academicYears,
    defaultYear: defaultYear ? defaultYear.admissionYear : new Date().getFullYear(),
    offerings,
    activeTab: "bulk",
    result: null,
    bulkResult: {
      total: rows.length,
      created,
      skipped,
    },
    breadcrumbs: getBreadcrumbs(req, "Enroll Students"),
  });
};
