const crypto = require("crypto");
const { StudentProfile, SemesterCertificate, Assessment, Submission, SubjectEnrollment } = require("../models");

// A student is eligible for a semester certificate once every assessment
// tied to a subject they're enrolled in for that program+semester+session
// has been evaluated. Simple pass/fail-free eligibility check for now —
// grading thresholds can be layered on later without changing this shape.
async function checkEligibility({ studentId, programId, semesterNumber, academicSessionId }) {
  const enrollments = await SubjectEnrollment.findAll({
    where: { studentId },
    include: [{
      model: require("../models").SubjectOffering,
      where: { programId, semesterNumber, academicSessionId },
    }],
  });

  if (!enrollments.length) return { eligible: false, reason: "No subject enrollments found for this program/semester/session." };

  const offeringIds = enrollments.map((e) => e.subjectOfferingId);
  const assessments = await Assessment.findAll({ where: { subjectOfferingId: offeringIds } });
  const submissions = await Submission.findAll({ where: { studentId, assessmentId: assessments.map((a) => a.id) } });

  const unevaluated = assessments.filter((a) => {
    const sub = submissions.find((s) => s.assessmentId === a.id);
    return !sub || sub.status !== "EVALUATED";
  });

  if (unevaluated.length) {
    return { eligible: false, reason: `${unevaluated.length} assessment(s) not yet evaluated.`, unevaluated };
  }
  return { eligible: true };
}

async function generateCertificate({ studentId, programId, semesterNumber, academicSessionId, aiLevel }) {
  const existing = await SemesterCertificate.findOne({ where: { studentId, programId, semesterNumber, academicSessionId } });
  if (existing) return existing;

  const verificationCode = crypto.randomBytes(8).toString("hex").toUpperCase();
  return SemesterCertificate.create({ studentId, programId, semesterNumber, academicSessionId, verificationCode, aiLevel: aiLevel || null });
}

module.exports = { checkEligibility, generateCertificate };
