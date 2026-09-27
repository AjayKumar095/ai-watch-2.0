const { StudentProfile, User, Program, SemesterCertificate, AuditLog } = require("../models");
const {
  checkEligibility,
  generateCertificate,
  renderCertificatePdfBuffer,
  listEligibleUncertifiedStudents,
  issueCertificatesBulk,
} = require("../services/certificateService");
const { distinctAdmissionYears } = require("../services/admissionYearService");
const { LEVEL_PATTERNS, formatAiLevel } = require("../utils/courseLevel");
const logger = require("../utils/logger");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const CERTS = { label: "Certificates", url: "/admin/certificates" };
const LEVEL_OPTIONS = LEVEL_PATTERNS.map((p) => p.label);

exports.list = async (req, res) => {
  const [certificateRows, eligibleUncertified] = await Promise.all([
    SemesterCertificate.findAll({
      include: [{ model: StudentProfile, include: [User] }, Program],
      order: [["issuedAt", "DESC"]],
    }),
    listEligibleUncertifiedStudents(),
  ]);
  // "AI Level I (Fundamentals)" for display — the raw aiLevel column just
  // stores the bare label ("Fundamentals").
  const certificates = certificateRows.map((c) => Object.assign(c.toJSON(), { levelDisplay: formatAiLevel(c.aiLevel) }));

  res.render("admin/certificates/index", {
    title: "Certificates",
    certificates,
    eligibleUncertified,
    status: req.query.status || null,
    error: req.query.error || null,
    breadcrumbs: [ROOT, { label: "Certificates" }],
  });
};

/**
 * One endpoint for both the per-row "Issue" button and the "Issue
 * Selected" bulk button on the Certificates page — a single row just
 * submits a one-entry selection. Each selection is
 * "studentId:programId:semesterNumber:admissionYear", matching the
 * existing target-string convention used elsewhere in this app (e.g. the
 * assessment create form's `targets`).
 */
exports.issue = async (req, res) => {
  let selections = req.body.selections || [];
  if (!Array.isArray(selections)) selections = [selections];
  if (!selections.length) {
    return res.redirect(`/admin/certificates?error=${encodeURIComponent("No students selected.")}`);
  }

  const entries = [];
  for (const s of selections) {
    const [studentId, programId, semesterNumberRaw, admissionYearRaw] = s.split(":");
    const semesterNumber = parseInt(semesterNumberRaw, 10);
    const admissionYear = parseInt(admissionYearRaw, 10);
    if (!studentId || !programId || !semesterNumber || !admissionYear) continue;
    entries.push({ studentId, programId, semesterNumber, admissionYear });
  }
  if (!entries.length) {
    return res.redirect(`/admin/certificates?error=${encodeURIComponent("Nothing valid was selected.")}`);
  }

  const { issued, failed } = await issueCertificatesBulk(entries);

  for (const cert of issued) {
    await AuditLog.create({
      userId: req.currentUser.id,
      action: "GENERATE_CERTIFICATE",
      entityType: "StudentProfile",
      entityId: cert.studentId,
      metadata: { programId: cert.programId, semesterNumber: cert.semesterNumber, admissionYear: cert.admissionYear, bulk: entries.length > 1 },
    });
  }
  if (failed.length) {
    logger.error("Some certificate issuances failed", { failed });
  }

  const parts = [];
  if (issued.length) parts.push(`${issued.length} certificate(s) issued.`);
  if (failed.length) parts.push(`${failed.length} failed — ${failed.map((f) => f.error).join(" ")}`);

  // A total failure (nothing issued at all) reads as an error; partial or
  // full success reads as an informational status, even if some entries
  // in the same batch failed alongside successful ones.
  const param = issued.length ? "status" : "error";
  res.redirect(`/admin/certificates?${param}=${encodeURIComponent(parts.join(" "))}`);
};

exports.showGenerate = async (req, res) => {
  const [students, programs, years] = await Promise.all([
    StudentProfile.findAll({ where: { status: "ACTIVE" }, include: [User, Program] }),
    Program.findAll({ where: { isActive: true } }),
    distinctAdmissionYears(),
  ]);
  res.render("admin/certificates/new", {
    title: "Generate Certificate", students, programs, years, levelOptions: LEVEL_OPTIONS, error: null, eligibility: null,
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
      title: "Generate Certificate", students, programs, years, levelOptions: LEVEL_OPTIONS, breadcrumbs, eligibility: null,
      error: "All fields are required.",
    });
  }

  // NOTE: checkEligibility now also requires the teacher to have locked
  // assessments for every subject/section this student sits in (see
  // certificateService.js) — "unevaluated" reasons and "not locked" reasons
  // both surface here so the admin knows exactly what's blocking issuance.
  const eligibility = await checkEligibility({ studentId, programId, semesterNumber: parseInt(semesterNumber, 10), admissionYear: parseInt(admissionYear, 10) });
  res.render("admin/certificates/new", {
    title: "Generate Certificate", students, programs, years, levelOptions: LEVEL_OPTIONS, breadcrumbs, error: null,
    eligibility: { ...eligibility, studentId, programId, semesterNumber: parseInt(semesterNumber, 10), admissionYear: parseInt(admissionYear, 10) },
  });
};

exports.generate = async (req, res) => {
  const { studentId, programId, semesterNumber, admissionYear, aiLevel } = req.body;
  // A blank/unrecognized level (leftover free text, or a tampered request)
  // falls through to generateCertificate's own subject-based auto-detection
  // rather than storing junk on the certificate.
  const normalizedLevel = LEVEL_OPTIONS.find((l) => l.toLowerCase() === String(aiLevel || "").trim().toLowerCase()) || null;

  let cert;
  try {
    cert = await generateCertificate({
      studentId, programId,
      semesterNumber: parseInt(semesterNumber, 10),
      admissionYear: parseInt(admissionYear, 10),
      aiLevel: normalizedLevel,
    });
  } catch (err) {
    return res.status(err.status || 500).redirect(`/admin/certificates/new?error=${encodeURIComponent(err.message)}`);
  }

  await AuditLog.create({
    userId: req.currentUser.id, action: "GENERATE_CERTIFICATE", entityType: "StudentProfile", entityId: studentId,
    metadata: { programId, semesterNumber },
  });

  res.redirect(`/admin/certificates/${cert.id}/download`);
};

/**
 * Streams the certificate PDF straight from the Python plugin's stdout to
 * the HTTP response — rendered fresh each time, never written to disk.
 */
exports.download = async (req, res) => {
  try {
    const buffer = await renderCertificatePdfBuffer(req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="certificate-${req.params.id}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(err.status || 500).redirect(`/admin/certificates?error=${encodeURIComponent(err.message)}`);
  }
};
