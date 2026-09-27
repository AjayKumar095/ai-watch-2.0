// SemesterCertificate is issued per (student, program, semester,
// admissionYear) — NOT per subject offering (see the unique index on
// that model). A single semester can have more than one subject offering
// under it, so eligibility means ALL of them are complete, not just one.
//
// Per-offering completion means the same three things as before:
//   1. Every assessment visible to the student for it is SUBMITTED.
//   2. Every one of those submissions is EVALUATED (marks don't matter).
//   3. The teacher has LOCKED the assessments for the student's own
//      section + specialization scope specifically.
const {
  SubjectOffering,
  SubjectPool,
  Assessment,
  AssessmentSection,
  AssessmentSectionSpecialization,
  AssessmentLock,
  AssessmentLockSpecialization,
  Submission,
  StudentProfile,
  SubjectEnrollment,
} = require("../models");
const { visibleSectionIdsForStudent, specializationMatches, lockCoversSection } = require("./sectionScope");
const { extractCourseLevel } = require("../utils/courseLevel");

// Checks ONE subject offering's completion for a student. Internal
// building block for the semester-level check below.
async function checkSubjectOfferingComplete(studentProfile, subjectOffering) {
  const enrollment = await SubjectEnrollment.findOne({
    where: { studentId: studentProfile.id, subjectOfferingId: subjectOffering.id },
  });
  if (!enrollment) return { complete: false, reason: `Not enrolled in ${subjectOffering.SubjectPool.name}.` };

  const visibleSectionIds = await visibleSectionIdsForStudent(enrollment.sectionId);
  if (!visibleSectionIds.length) return { complete: false, reason: "No section assigned yet." };

  const candidateAssessments = await Assessment.findAll({
    where: { subjectOfferingId: subjectOffering.id, isActive: true },
    include: [
      {
        model: AssessmentSection,
        where: { sectionId: visibleSectionIds },
        required: true,
        include: [{ model: AssessmentSectionSpecialization, as: "sectionSpecializations" }],
      },
    ],
  });

  const visibleAssessments = candidateAssessments.filter((a) =>
    a.AssessmentSections.some((as) =>
      specializationMatches(studentProfile.specializationId, (as.sectionSpecializations || []).map((s) => s.specializationId))
    )
  );

  if (!visibleAssessments.length) {
    return { complete: false, reason: `No assessments assigned yet for ${subjectOffering.SubjectPool.name}.` };
  }

  const submissions = await Submission.findAll({
    where: { studentId: studentProfile.id, assessmentId: visibleAssessments.map((a) => a.id) },
  });
  const byAssessmentId = {};
  submissions.forEach((s) => {
    byAssessmentId[s.assessmentId] = s;
  });

  const missing = [];
  const unevaluated = [];
  for (const a of visibleAssessments) {
    const sub = byAssessmentId[a.id];
    if (!sub) missing.push(a.title);
    else if (sub.status !== "EVALUATED") unevaluated.push(a.title);
  }
  if (missing.length) {
    return { complete: false, reason: `${subjectOffering.SubjectPool.name}: not yet submitted — ${missing.join(", ")}.` };
  }
  if (unevaluated.length) {
    return { complete: false, reason: `${subjectOffering.SubjectPool.name}: awaiting evaluation — ${unevaluated.join(", ")}.` };
  }

  const locks = await AssessmentLock.findAll({
    where: { subjectOfferingId: subjectOffering.id, isLocked: true },
    include: [{ model: AssessmentLockSpecialization, as: "lockSpecializations" }],
  });
  let coveredByLock = false;
  for (const lock of locks) {
    let sectionCovered = false;
    for (const sectionId of visibleSectionIds) {
      if (await lockCoversSection(lock, sectionId)) {
        sectionCovered = true;
        break;
      }
    }
    if (!sectionCovered) continue;
    const lockSpecIds = (lock.lockSpecializations || []).map((s) => s.specializationId);
    if (specializationMatches(studentProfile.specializationId, lockSpecIds)) {
      coveredByLock = true;
      break;
    }
  }
  if (!coveredByLock) {
    return { complete: false, reason: `${subjectOffering.SubjectPool.name}: your teacher hasn't finalized (locked) it yet.` };
  }

  return { complete: true, reason: null, level: extractCourseLevel(subjectOffering.SubjectPool.name) };
}

async function checkSemesterCertificateEligibility(studentProfileId, programId, semesterNumber, admissionYear) {
  const studentProfile = await StudentProfile.findByPk(studentProfileId);
  if (!studentProfile) return { eligible: false, reason: "Student profile not found." };

  const offerings = await SubjectOffering.findAll({
    where: { programId, semesterNumber, admissionYear },
    include: [SubjectPool],
  });

  const enrolledOfferings = [];
  for (const o of offerings) {
    const enrolled = await SubjectEnrollment.findOne({ where: { studentId: studentProfileId, subjectOfferingId: o.id } });
    if (enrolled) enrolledOfferings.push(o);
  }

  if (!enrolledOfferings.length) {
    return { eligible: false, reason: "You're not enrolled in any subject for this semester yet." };
  }

  const reasons = [];
  const levels = new Set();
  for (const offering of enrolledOfferings) {
    const result = await checkSubjectOfferingComplete(studentProfile, offering);
    if (!result.complete) reasons.push(result.reason);
    else if (result.level) levels.add(result.level);
  }

  if (reasons.length) {
    return { eligible: false, reason: reasons.join(" ") };
  }

  // Typically exactly one subject per program+semester in this system, so
  // exactly one level. If more than one distinct level somehow shows up
  // across multiple subjects in the same semester, leave it blank rather
  // than guess which belongs on the certificate — aiLevel is nullable for
  // exactly this reason.
  const level = levels.size === 1 ? [...levels][0] : null;

  return { eligible: true, reason: null, level };
}

module.exports = { checkSemesterCertificateEligibility, checkSubjectOfferingComplete };
