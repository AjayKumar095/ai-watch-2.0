const { StudentProfile, Program, SemesterCertificate } = require("../models");
const { getProgressOverview, renderCertificatePdfBuffer } = require("../services/certificateService");
const { formatAiLevel } = require("../utils/courseLevel");
const logger = require("../utils/logger");

const ROOT = { label: "Dashboard", url: "/student/dashboard" };

// Two tabs, powered by two different sources:
//  - "Progress" comes from certificateService.getProgressOverview, which
//    groups this student's enrollments into (program, semester,
//    admissionYear) scopes and reports evaluated/total + lock status for
//    each — including scopes that haven't produced a certificate yet.
//  - "Certificates" is just the SemesterCertificate rows that already
//    exist for this student — nothing to compute, just list + link to
//    download.
// index.ejs's download links are keyed by the certificate's own id
// (p.certificateId / c.id), not by semester number, so the download route
// below matches that instead of the old semesterNumber-based one.
exports.list = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({ where: { userId: req.currentUser.id } });
  if (!studentProfile) return res.redirect("/student/dashboard");

  // The two tabs link to ?tab=progress and ?tab=certificates; default to
  // "progress" for a bare /student/certificates visit.
  const activeTab = req.query.tab === "certificates" ? "certificates" : "progress";

  const [progress, certificateRows] = await Promise.all([
    getProgressOverview(studentProfile.id),
    SemesterCertificate.findAll({
      where: { studentId: studentProfile.id },
      include: [Program],
      order: [
        ["admissionYear", "DESC"],
        ["semesterNumber", "DESC"],
      ],
    }),
  ]);
  // "AI Level I (Fundamentals)" for display — the raw aiLevel column just
  // stores the bare label ("Fundamentals"). getProgressOverview's `progress`
  // array already includes its own levelDisplay for the same reason.
  const certificates = certificateRows.map((c) => Object.assign(c.toJSON(), { levelDisplay: formatAiLevel(c.aiLevel) }));

  res.render("student/certificates", {
    title: "My Certificates",
    activeTab,
    progress,
    certificates,
    error: req.query.error || null,
    breadcrumbs: [ROOT, { label: "My Certificates" }],
  });
};

exports.download = async (req, res) => {
  const { certificateId } = req.params;

  const studentProfile = await StudentProfile.findOne({ where: { userId: req.currentUser.id } });
  if (!studentProfile) return res.redirect("/student/certificates");

  // Scoped to studentId as part of the WHERE, not checked after the fact —
  // this is what stops one student from downloading another's certificate
  // by guessing/incrementing an id in the URL.
  const certificate = await SemesterCertificate.findOne({
    where: { id: certificateId, studentId: studentProfile.id },
  });
  if (!certificate) {
    return res.redirect("/student/certificates?tab=certificates&error=" + encodeURIComponent("Certificate not found."));
  }

  try {
    const buffer = await renderCertificatePdfBuffer(certificate.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="certificate-sem${certificate.semesterNumber}-${certificate.verificationCode}.pdf"`
    );
    res.send(buffer);
  } catch (err) {
    logger.error("Certificate PDF render failed", { certificateId: certificate.id, studentId: studentProfile.id, error: err.message });
    res.redirect(
      "/student/certificates?tab=certificates&error=" +
        encodeURIComponent("Couldn't generate the certificate PDF. Please try again or contact support.")
    );
  }
};
