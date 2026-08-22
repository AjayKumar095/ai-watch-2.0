const {
  User,
  TeacherProfile,
  StudentProfile,
  School,
  Program,
  SubjectPool,
  AcademicSession,
  AuditLog,
} = require("../models");
const { hashPassword } = require("../utils/password");
const crypto = require("crypto");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };

exports.dashboard = async (req, res) => {
  const [teacherCount, studentCount, schoolCount, programCount, subjectCount, sessionCount] = await Promise.all([
    TeacherProfile.count(),
    StudentProfile.count(),
    School.count(),
    Program.count(),
    SubjectPool.count(),
    AcademicSession.count(),
  ]);

  res.render("admin/dashboard", {
    title: "Superadmin Dashboard",
    stats: { teacherCount, studentCount, schoolCount, programCount, subjectCount, sessionCount },
    breadcrumbs: [{ label: "Dashboard" }],
  });
};

exports.showCreateTeacher = async (req, res) => {
  const schools = await School.findAll({ where: { isActive: true } });
  res.render("admin/create-teacher", { title: "Create Teacher Account", schools, error: null, formData: {}, breadcrumbs: [ROOT, { label: "Create Teacher" }] });
};

exports.createTeacher = async (req, res) => {
  const { email, firstName, lastName, employeeCode, schoolId, designation } = req.body;
  const schools = await School.findAll({ where: { isActive: true } });
  const breadcrumbs = [ROOT, { label: "Create Teacher" }];
  const rerender = (error) =>
    res.status(400).render("admin/create-teacher", { title: "Create Teacher Account", schools, error, formData: req.body, breadcrumbs });

  if (!email || !firstName || !lastName || !employeeCode || !schoolId) {
    return rerender("Please fill in all required fields.");
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) return rerender("An account with this email already exists.");

  // Generate a temporary password; in production this is emailed to the
  // teacher via the background job queue rather than shown on-screen.
  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);

  const user = await User.create({
    email,
    firstName,
    lastName,
    passwordHash,
    role: "TEACHER",
    isActive: true,
  });

  await TeacherProfile.create({ userId: user.id, employeeCode, schoolId, designation });

  await AuditLog.create({
    userId: req.currentUser.id,
    action: "CREATE_TEACHER",
    entityType: "User",
    entityId: user.id,
    metadata: { email },
  });

  res.render("admin/create-teacher-success", { title: "Teacher Created", email, tempPassword, breadcrumbs: [ROOT, { label: "Create Teacher" }] });
};

// ---------------------------------------------------------------------------
// Teacher-subject-section mapping (with conflict flag)
// ---------------------------------------------------------------------------

const { createMapping } = require("../services/teacherMappingService");
const {
  SubjectOffering,
  Section,
  TeacherSubjectMapping,
  SubjectEnrollment,
} = require("../models");

exports.showCreateMapping = async (req, res) => {
  const [teachers, offerings, sections] = await Promise.all([
    TeacherProfile.findAll({ include: [User] }),
    SubjectOffering.findAll({ include: [SubjectPool, Program] }),
    Section.findAll(),
  ]);
  res.render("admin/create-mapping", { title: "Map Teacher to Subject", teachers, offerings, sections, error: null, formData: {}, breadcrumbs: [ROOT, { label: "Teacher Mappings", url: "/admin/mappings" }, { label: "Add Mapping" }] });
};

exports.createMapping = async (req, res) => {
  const { teacherId, subjectOfferingId, sectionId } = req.body;
  const [teachers, offerings, sections] = await Promise.all([
    TeacherProfile.findAll({ include: [User] }),
    SubjectOffering.findAll({ include: [SubjectPool, Program] }),
    Section.findAll(),
  ]);
  const breadcrumbs = [ROOT, { label: "Teacher Mappings", url: "/admin/mappings" }, { label: "Add Mapping" }];
  const rerender = (error, status = 400) =>
    res.status(status).render("admin/create-mapping", { title: "Map Teacher to Subject", teachers, offerings, sections, error, formData: req.body, breadcrumbs });

  if (!teacherId || !subjectOfferingId) return rerender("Please select both a teacher and a subject offering.");

  try {
    await createMapping({ teacherId, subjectOfferingId, sectionId: sectionId || null });
    await AuditLog.create({
      userId: req.currentUser.id,
      action: "CREATE_MAPPING",
      entityType: "TeacherSubjectMapping",
      entityId: subjectOfferingId,
      metadata: { teacherId, sectionId },
    });
    res.redirect("/admin/dashboard");
  } catch (err) {
    if (err.code === "MAPPING_CONFLICT") {
      return rerender(
        `⚠️ Conflict: this subject${err.conflict.sectionId ? "/section" : " (all sections)"} is already mapped to ${err.conflict.teacherName} (${err.conflict.teacherEmail}). Remove that mapping first, or choose a different section.`,
        409
      );
    }
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Enrollment — default auto-enroll rule (program + semester + specialization
// match), with the resulting roster editable afterwards for exceptions
// (mixed-specialization classes etc.) — see architecture report §7.4.
// ---------------------------------------------------------------------------

exports.showEnroll = async (req, res) => {
  const offerings = await SubjectOffering.findAll({ include: [SubjectPool, Program] });
  res.render("admin/enroll", { title: "Enroll Students", offerings, result: null, breadcrumbs: [ROOT, { label: "Enroll Students" }] });
};

exports.autoEnroll = async (req, res) => {
  const { subjectOfferingId } = req.body;
  const offering = await SubjectOffering.findByPk(subjectOfferingId, { include: [SubjectPool, Program] });
  if (!offering) return res.redirect("/admin/enroll");

  const matchingStudents = await StudentProfile.findAll({
    where: {
      programId: offering.programId,
      currentSemesterNumber: offering.semesterNumber,
      ...(offering.specializationId ? { specializationId: offering.specializationId } : {}),
      currentSectionId: { [require("sequelize").Op.ne]: null },
    },
  });

  let created = 0;
  let skipped = 0;
  for (const student of matchingStudents) {
    const [, wasCreated] = await SubjectEnrollment.findOrCreate({
      where: { subjectOfferingId: offering.id, studentId: student.id },
      defaults: { sectionId: student.currentSectionId },
    });
    if (wasCreated) created++;
    else skipped++;
  }

  const offerings = await SubjectOffering.findAll({ include: [SubjectPool, Program] });
  res.render("admin/enroll", {
    title: "Enroll Students",
    offerings,
    result: { offeringName: offering.SubjectPool.name, created, skipped, total: matchingStudents.length },
    breadcrumbs: [ROOT, { label: "Enroll Students" }],
  });
};

exports.listMappings = async (req, res) => {
  const mappings = await TeacherSubjectMapping.findAll({
    include: [
      { model: TeacherProfile, include: [User] },
      { model: SubjectOffering, include: [SubjectPool, Program] },
      Section,
    ],
    order: [["createdAt", "DESC"]],
  });
  res.render("admin/mappings/index", { title: "Teacher-Subject Mappings", mappings, breadcrumbs: [ROOT, { label: "Teacher Mappings" }] });
};
