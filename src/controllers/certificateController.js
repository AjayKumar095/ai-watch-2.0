const { StudentProfile, User, Program, AcademicSession, SemesterCertificate } = require("../models");
const { checkEligibility, generateCertificate } = require("../services/certificateService");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const CERTS = { label: "Certificates", url: "/admin/certificates" };

exports.list = async (req, res) => {
  const certificates = await SemesterCertificate.findAll({
    include: [{ model: StudentProfile, include: [User] }, Program, AcademicSession],
    order: [["issuedAt", "DESC"]],
  });
  res.render("admin/certificates/index", { title: "Certificates", certificates, breadcrumbs: [ROOT, { label: "Certificates" }] });
};

exports.showGenerate = async (req, res) => {
  const [students, programs, sessions] = await Promise.all([
    StudentProfile.findAll({ where: { status: "ACTIVE" }, include: [User, Program] }),
    Program.findAll({ where: { isActive: true } }),
    require("../models").AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  res.render("admin/certificates/new", {
    title: "Generate Certificate", students, programs, sessions, error: null, eligibility: null,
    breadcrumbs: [ROOT, CERTS, { label: "Generate" }],
  });
};

exports.checkAndPreview = async (req, res) => {
  const { studentId, programId, semesterNumber, academicSessionId } = req.body;
  const [students, programs, sessions] = await Promise.all([
    StudentProfile.findAll({ where: { status: "ACTIVE" }, include: [User, Program] }),
    Program.findAll({ where: { isActive: true } }),
    require("../models").AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  const breadcrumbs = [ROOT, CERTS, { label: "Generate" }];

  if (!studentId || !programId || !semesterNumber || !academicSessionId) {
    return res.status(400).render("admin/certificates/new", {
      title: "Generate Certificate", students, programs, sessions, breadcrumbs, eligibility: null,
      error: "All fields are required.",
    });
  }

  const eligibility = await checkEligibility({ studentId, programId, semesterNumber: parseInt(semesterNumber, 10), academicSessionId });
  res.render("admin/certificates/new", {
    title: "Generate Certificate", students, programs, sessions, breadcrumbs, error: null,
    eligibility: { ...eligibility, studentId, programId, semesterNumber: parseInt(semesterNumber, 10), academicSessionId },
  });
};

exports.generate = async (req, res) => {
  const { studentId, programId, semesterNumber, academicSessionId, aiLevel } = req.body;
  await generateCertificate({ studentId, programId, semesterNumber: parseInt(semesterNumber, 10), academicSessionId, aiLevel });

  const { AuditLog } = require("../models");
  await AuditLog.create({
    userId: req.currentUser.id, action: "GENERATE_CERTIFICATE", entityType: "StudentProfile", entityId: studentId,
    metadata: { programId, semesterNumber },
  });

  res.redirect("/admin/certificates");
};
