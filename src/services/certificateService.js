const crypto = require("crypto");
const {
  StudentProfile,
  User,
  Program,
  SemesterCertificate,
  Assessment,
  Submission,
  SubjectEnrollment,
  SubjectOffering,
  SubjectPool,
} = require("../models");
const { isLocked } = require("./assessmentLockService");
const { extractLevel, formatAiLevel } = require("../utils/courseLevel");
const { generateCertificate: renderCertificatePdf } = require("../utils/certificateGenerator");

/**
 * The level printed on a certificate comes from the SUBJECT(S) the student
 * completed, not the program — the same subject can be reused across
 * different programs at different levels, so the level lives on
 * SubjectPool, not Program. Prefers each enrolled subject's own curated
 * `level` field (set via the admin Subject Pool dropdown); falls back to
 * matching a level word in the subject's name for older subjects that
 * haven't had their level field set yet.
 *
 * Typically exactly one subject per program+semester in this system, so
 * exactly one level. If more than one distinct level somehow shows up
 * across multiple subjects in the same semester, this returns null rather
 * than guess which one belongs on the certificate.
 */
async function resolveLevelForStudentScope({ studentId, programId, semesterNumber, admissionYear }) {
  const enrollments = await SubjectEnrollment.findAll({
    where: { studentId },
    include: [
      {
        model: SubjectOffering,
        where: { programId, semesterNumber, admissionYear },
        include: [SubjectPool],
      },
    ],
  });
  return levelFromEnrollments(enrollments);
}

// Shared by resolveLevelForStudentScope and getProgressOverview (which
// already has the enrollments loaded, so it calls this directly instead of
// re-querying).
function levelFromEnrollments(enrollments) {
  const levels = new Set();
  for (const e of enrollments) {
    const pool = e.SubjectOffering && e.SubjectOffering.SubjectPool;
    if (!pool) continue;
    const level = pool.level || extractLevel(pool.name);
    if (level) levels.add(level);
  }
  return levels.size === 1 ? [...levels][0] : null;
}

/**
 * Eligibility, in order:
 *   1. Student is enrolled in every subject offering for this
 *      program+semester+admissionYear.
 *   2. Every assessment tied to those offerings has an EVALUATED submission
 *      from this student (regardless of marks obtained — evaluationController
 *      already allows a 0-mark, remarks-only evaluation to count).
 *   3. The section the student actually submitted into is LOCKED for every
 *      one of those offerings — i.e. the teacher has declared "I'm done
 *      giving assessments for this section" via assessmentLockController.
 *
 * All three must hold. Locking is deliberately checked per-offering+section
 * pair (not just "some lock exists somewhere") so a partially-locked set of
 * subjects doesn't falsely certify a student.
 */
async function checkEligibility({ studentId, programId, semesterNumber, admissionYear }) {
  const enrollments = await SubjectEnrollment.findAll({
    where: { studentId },
    include: [{
      model: SubjectOffering,
      where: { programId, semesterNumber, admissionYear },
    }],
  });

  if (!enrollments.length) {
    return { eligible: false, reason: "No subject enrollments found for this program/semester/admission year." };
  }

  const offeringIds = enrollments.map((e) => e.subjectOfferingId);
  const assessments = await Assessment.findAll({ where: { subjectOfferingId: offeringIds } });
  const submissions = await Submission.findAll({
    where: { studentId, assessmentId: assessments.map((a) => a.id) },
  });

  const unevaluated = assessments.filter((a) => {
    const sub = submissions.find((s) => s.assessmentId === a.id);
    return !sub || sub.status !== "EVALUATED";
  });

  if (unevaluated.length) {
    return { eligible: false, reason: `${unevaluated.length} assessment(s) not yet evaluated.`, unevaluated };
  }

  // Derive the (subjectOfferingId, sectionId) pairs this student actually
  // sits in, from their own submissions (denormalized sectionId), and make
  // sure every one of them is locked.
  const offeringToSection = new Map(); // offeringId -> sectionId
  for (const a of assessments) {
    const sub = submissions.find((s) => s.assessmentId === a.id);
    if (sub && sub.sectionId) offeringToSection.set(a.subjectOfferingId, sub.sectionId);
  }

  const unlockedOfferings = [];
  for (const [subjectOfferingId, sectionId] of offeringToSection.entries()) {
    const locked = await isLocked({ subjectOfferingId, sectionId });
    if (!locked) unlockedOfferings.push(subjectOfferingId);
  }

  if (unlockedOfferings.length) {
    return {
      eligible: false,
      reason: "The teacher has not yet locked assessments for all of this student's subjects.",
      unlockedOfferings,
    };
  }

  return { eligible: true };
}

/**
 * Creates (or returns the existing) SemesterCertificate row. This step still
 * persists — it's the record of "this student earned this certificate" and
 * the source of the verificationCode. It does NOT render or store a PDF;
 * rendering happens on demand, in memory, via renderCertificatePdfBuffer.
 */
async function generateCertificate({ studentId, programId, semesterNumber, admissionYear, aiLevel }) {
  const existing = await SemesterCertificate.findOne({ where: { studentId, programId, semesterNumber, admissionYear } });
  if (existing) return existing;

  const eligibility = await checkEligibility({ studentId, programId, semesterNumber, admissionYear });
  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason || "Student is not eligible for a certificate.");
    err.status = 422;
    throw err;
  }

  const verificationCode = crypto.randomBytes(8).toString("hex").toUpperCase();

  let resolvedLevel = aiLevel || null;
  if (!resolvedLevel) {
    resolvedLevel = await resolveLevelForStudentScope({ studentId, programId, semesterNumber, admissionYear });
  }

  return SemesterCertificate.create({
    studentId,
    programId,
    semesterNumber,
    admissionYear,
    verificationCode,
    aiLevel: resolvedLevel,
  });
}

/**
 * Renders the actual PDF bytes for an already-issued SemesterCertificate,
 * entirely in memory — nothing is written to disk. Call this from the route
 * that streams the download to the student (or to the admin preview), each
 * time it's requested, using the verificationCode already stored on the row
 * so re-downloads always show the same code.
 *
 * @returns {Promise<Buffer>} raw PDF bytes
 */
async function renderCertificatePdfBuffer(certificateId) {
  const cert = await SemesterCertificate.findByPk(certificateId, {
    include: [{ model: StudentProfile, include: [User] }, Program],
  });
  if (!cert) {
    const err = new Error("Certificate not found.");
    err.status = 404;
    throw err;
  }

  // fullName is a User instance METHOD, not a Sequelize virtual getter — it
  // must be called. Reading it as a plain property (the old code) returns
  // the function object itself; passed through to the PDF, that silently
  // stringifies into the function's own source text instead of throwing,
  // which is exactly the "function () { return [this.title, ..." garbage
  // that was printing on the certificate instead of a name.
  const userRecord = cert.StudentProfile?.User;
  let studentName = userRecord?.fullName;
  if (typeof studentName === "function") studentName = studentName.call(userRecord);
  studentName = studentName || userRecord?.name;
  if (!studentName) {
    const err = new Error("Certificate's student record has no name to print.");
    err.status = 500;
    throw err;
  }

  // Fallback to the program name only for certificates issued before
  // subject-level tagging existed and never got an aiLevel stored at all.
  const rawLevel = cert.aiLevel || (cert.Program ? extractLevel(cert.Program.name) : null);
  const displayLevel = formatAiLevel(rawLevel); // "AI Level I (Fundamentals)", or null
  const programLabel = cert.Program ? cert.Program.name.replace(/\s*\([^)]*\)\s*/g, " ").trim() : "the program";
  const description = `has successfully completed all assessments for Semester ${cert.semesterNumber} of ${programLabel} in the AI Enablement Program.`;

  const { buffer } = await renderCertificatePdf({
    name: studentName,
    aiLevel: displayLevel || undefined,
    description,
    certCode: cert.verificationCode, // reuse the DB code — never regenerate a different one
  });

  return buffer;
}

/**
 * Groups this student's enrollments into distinct (program, semester,
 * admissionYear) scopes and reports where each one stands: how many
 * assessments are evaluated out of how many, whether the section is locked,
 * whether a certificate has been issued, and — if not — which of the two
 * gates (evaluation / lock) is still open. Powers the "Progress" tab, where
 * an un-issued scope renders as a locked certificate placeholder.
 */
async function getProgressOverview(studentId) {
  const enrollments = await SubjectEnrollment.findAll({
    where: { studentId },
    include: [{ model: SubjectOffering, include: [SubjectPool] }],
  });

  const scopeKey = (o) => `${o.programId}:${o.semesterNumber}:${o.admissionYear}`;
  const scopes = new Map();
  for (const e of enrollments) {
    const o = e.SubjectOffering;
    if (!o) continue;
    const key = scopeKey(o);
    if (!scopes.has(key)) {
      scopes.set(key, { programId: o.programId, semesterNumber: o.semesterNumber, admissionYear: o.admissionYear });
    }
  }

  const results = [];
  for (const scope of scopes.values()) {
    const [program, existingCert, eligibility] = await Promise.all([
      Program.findByPk(scope.programId),
      SemesterCertificate.findOne({ where: { studentId, ...scope } }),
      checkEligibility({ studentId, ...scope }),
    ]);

    // Re-derive raw counts for a progress bar (X of Y evaluated), separate
    // from the pass/fail eligibility.reason string.
    const enrollmentsForScope = enrollments.filter((e) => e.SubjectOffering && scopeKey(e.SubjectOffering) === scopeKey(scope));
    const offeringIds = enrollmentsForScope.map((e) => e.subjectOfferingId);
    const assessments = await Assessment.findAll({ where: { subjectOfferingId: offeringIds } });
    const submissions = await Submission.findAll({
      where: { studentId, assessmentId: assessments.map((a) => a.id) },
    });
    const evaluatedCount = assessments.filter((a) => {
      const sub = submissions.find((s) => s.assessmentId === a.id);
      return sub && sub.status === "EVALUATED";
    }).length;

    const level = levelFromEnrollments(enrollmentsForScope);

    results.push({
      programId: scope.programId,
      programName: program ? program.name : "Unknown Program",
      level,
      levelDisplay: formatAiLevel(level), // "AI Level I (Fundamentals)", or null
      semesterNumber: scope.semesterNumber,
      admissionYear: scope.admissionYear,
      totalAssessments: assessments.length,
      evaluatedCount,
      locked: existingCert ? true : eligibility.eligible, // certificate already issued implies it was locked
      issued: !!existingCert,
      certificateId: existingCert ? existingCert.id : null,
      eligible: eligibility.eligible,
      reason: eligibility.eligible ? null : eligibility.reason,
    });
  }

  // Most recent semester first.
  results.sort((a, b) => b.admissionYear - a.admissionYear || b.semesterNumber - a.semesterNumber);
  return results;
}

/**
 * Scans every (program, semester, admissionYear) scope that has at least
 * one enrollment, and returns every student in each scope who is eligible
 * for a certificate but doesn't have one yet. Powers the admin
 * Certificates page's "Eligible for Certificate" list, so an admin doesn't
 * have to already know which student/program/semester/year combo to type
 * into the one-at-a-time "Generate Certificate" form.
 *
 * This necessarily re-runs checkEligibility per pending student (same
 * three gates as everywhere else: enrolled, evaluated, locked) — for a
 * school-wide list that's O(scopes × students-per-scope) queries, which is
 * fine at typical class sizes but worth knowing if this ever needs to run
 * on a very large roster.
 */
async function listEligibleUncertifiedStudents() {
  const enrollments = await SubjectEnrollment.findAll({
    include: [{ model: SubjectOffering, attributes: ["programId", "semesterNumber", "admissionYear"] }],
  });

  const scopeKey = (o) => `${o.programId}:${o.semesterNumber}:${o.admissionYear}`;
  const scopes = new Map(); // scopeKey -> { programId, semesterNumber, admissionYear, studentIds: Set }
  for (const e of enrollments) {
    const o = e.SubjectOffering;
    if (!o) continue;
    const key = scopeKey(o);
    if (!scopes.has(key)) {
      scopes.set(key, {
        programId: o.programId,
        semesterNumber: o.semesterNumber,
        admissionYear: o.admissionYear,
        studentIds: new Set(),
      });
    }
    scopes.get(key).studentIds.add(e.studentId);
  }

  const results = [];
  for (const scope of scopes.values()) {
    const studentIds = [...scope.studentIds];
    if (!studentIds.length) continue;

    // Skip students who already have a certificate for this exact scope —
    // no point re-checking their eligibility.
    const existingCerts = await SemesterCertificate.findAll({
      where: {
        studentId: studentIds,
        programId: scope.programId,
        semesterNumber: scope.semesterNumber,
        admissionYear: scope.admissionYear,
      },
      attributes: ["studentId"],
    });
    const alreadyIssued = new Set(existingCerts.map((c) => c.studentId));
    const pendingStudentIds = studentIds.filter((id) => !alreadyIssued.has(id));
    if (!pendingStudentIds.length) continue;

    const [program, students] = await Promise.all([
      Program.findByPk(scope.programId),
      StudentProfile.findAll({ where: { id: pendingStudentIds }, include: [User] }),
    ]);

    for (const student of students) {
      const eligibility = await checkEligibility({
        studentId: student.id,
        programId: scope.programId,
        semesterNumber: scope.semesterNumber,
        admissionYear: scope.admissionYear,
      });
      if (!eligibility.eligible) continue;

      results.push({
        studentId: student.id,
        studentName: student.User ? `${student.User.firstName} ${student.User.lastName}` : "Unknown Student",
        rollNo: student.rollNo || null,
        programId: scope.programId,
        programName: program ? program.name : "Unknown Program",
        semesterNumber: scope.semesterNumber,
        admissionYear: scope.admissionYear,
      });
    }
  }

  results.sort(
    (a, b) =>
      a.programName.localeCompare(b.programName) ||
      b.admissionYear - a.admissionYear ||
      b.semesterNumber - a.semesterNumber ||
      a.studentName.localeCompare(b.studentName)
  );
  return results;
}

/**
 * Issues certificates for a batch of {studentId, programId, semesterNumber,
 * admissionYear} entries — used for both the single-row "Issue" button and
 * the "Issue Selected" bulk button on the admin Certificates page, since a
 * single row is just a one-entry batch. generateCertificate is idempotent
 * (returns the existing row if already issued) and re-checks eligibility
 * itself, so this is safe even against a stale/tampered selection.
 */
async function issueCertificatesBulk(entries) {
  const issued = [];
  const failed = [];
  for (const entry of entries) {
    try {
      const cert = await generateCertificate(entry);
      issued.push({ ...entry, certificateId: cert.id });
    } catch (err) {
      failed.push({ ...entry, error: err.message });
    }
  }
  return { issued, failed };
}

module.exports = {
  checkEligibility,
  generateCertificate,
  renderCertificatePdfBuffer,
  getProgressOverview,
  listEligibleUncertifiedStudents,
  issueCertificatesBulk,
};