const { StudentProfile, User, Program, SemesterCertificate, AuditLog } = require("../models");
const { checkEligibility, generateCertificate } = require("../services/certificateService");
const { distinctAdmissionYears } = require("../services/admissionYearService");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const CERTS = { label: "Certificates", url: "/admin/certificates" };

exports.list = async (req, res) => {
  const certificates = await SemesterCertificate.findAll({
    include: [{ model: StudentProfile, include: [User] }, Program],
    order: [["issuedAt", "DESC"]],
  });
  res.render("admin/certificates/index", { title: "Certificates", certificates, breadcrumbs: [ROOT, { label: "Certificates" }] });
};

exports.showGenerate = async (req, res) => {
  const [students, programs, years] = await Promise.all([
    StudentProfile.findAll({ where: { status: "ACTIVE" }, include: [User, Program] }),
    Program.findAll({ where: { isActive: true } }),
    distinctAdmissionYears(),
  ]);
  res.render("admin/certificates/new", {
    title: "Generate Certificate", students, programs, years, error: null, eligibility: null,
    breadcrumbs: [ROOT, CERTS, { label: "Generate" }],
  });
};

exports.checkAndPreview = async (req, res) => {
  const { studentId, programId, semesterNumber, admissionYear } = req.body;
  const [students, programs, years] = await Promise.all([
    StudentProfile.findAll({ where: { status: "ACTIVE" }, include: [User, Program] }),
    Program.findAll({ where: { isActive: true } }),
    distinctAdmissionYears(),
  ]);
  const breadcrumbs = [ROOT, CERTS, { label: "Generate" }];

  if (!studentId || !programId || !semesterNumber || !admissionYear) {
    return res.status(400).render("admin/certificates/new", {
      title: "Generate Certificate", students, programs, years, breadcrumbs, eligibility: null,
      error: "All fields are required.",
    });
  }

  const eligibility = await checkEligibility({ studentId, programId, semesterNumber: parseInt(semesterNumber, 10), admissionYear: parseInt(admissionYear, 10) });
  res.render("admin/certificates/new", {
    title: "Generate Certificate", students, programs, years, breadcrumbs, error: null,
    eligibility: { ...eligibility, studentId, programId, semesterNumber: parseInt(semesterNumber, 10), admissionYear: parseInt(admissionYear, 10) },
  });
};

exports.generate = async (req, res) => {
  const { studentId, programId, semesterNumber, admissionYear, aiLevel } = req.body;
  await generateCertificate({ studentId, programId, semesterNumber: parseInt(semesterNumber, 10), admissionYear: parseInt(admissionYear, 10), aiLevel });

  await AuditLog.create({
    userId: req.currentUser.id, action: "GENERATE_CERTIFICATE", entityType: "StudentProfile", entityId: studentId,
    metadata: { programId, semesterNumber },
  });

  res.redirect("/admin/certificates");
};
