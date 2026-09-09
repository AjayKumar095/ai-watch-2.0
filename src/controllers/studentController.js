const {
  StudentProfile,
  SubjectEnrollment,
  SubjectOffering,
  SubjectPool,
  Assessment,
  AssessmentSection,
  Submission,
  SemesterCertificate,
  ApprovalRequest,
  Program,
  Section,
} = require("../models");
const { visibleSectionIdsForStudent } = require("../services/sectionScope");
const { sectionsFor } = require("../services/sectionLookupService");
const { enrollStudentInOfferings } = require("../services/enrollmentService");
const renderBlocks = require("../utils/renderBlocks");

const ROOT = { label: "Dashboard", url: "/student/dashboard" };

exports.dashboard = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({
    where: { userId: req.currentUser.id },
    include: [Program, { model: Section, as: "currentSection" }],
  });

  const enrollments = await SubjectEnrollment.findAll({
    where: { studentId: studentProfile.id },
    include: [{ model: SubjectOffering, include: [SubjectPool] }],
  });

  // An assessment is visible only if it's targeted (via AssessmentSection)
  // at the student's own section OR that section's parent (a "whole
  // Section" assessment is visible to every sub-group under it) — see
  // src/services/sectionScope.js. Enrollment alone is not enough: it
  // establishes the subject, not which section-scoped assessments apply.
  const assessments = [];
  for (const e of enrollments) {
    const visibleSectionIds = await visibleSectionIdsForStudent(e.sectionId);
    if (!visibleSectionIds.length) continue;
    const matching = await Assessment.findAll({
      where: { subjectOfferingId: e.subjectOfferingId, isActive: true },
      include: [
        { model: SubjectOffering, include: [SubjectPool] },
        { model: AssessmentSection, where: { sectionId: visibleSectionIds }, required: true },
      ],
      order: [["endAt", "ASC"]],
    });
    assessments.push(...matching);
  }

  const submissions = await Submission.findAll({ where: { studentId: studentProfile.id } });
  const submissionByAssessment = Object.fromEntries(submissions.map((s) => [s.assessmentId, s]));

  const certificates = await SemesterCertificate.findAll({ where: { studentId: studentProfile.id } });

  res.render("student/dashboard", {
    title: "Student Dashboard",
    studentProfile,
    assessments,
    submissionByAssessment,
    certificates,
    breadcrumbs: [{ label: "Dashboard" }],
  });
};

// --- Submission (link-based for now; production swaps this for a signed
// object-storage upload URL per the architecture report §4.2) -------------

const { AssessmentStudentOverride } = require("../models");

async function assertVisible(assessment, enrollment) {
  const visibleSectionIds = await visibleSectionIdsForStudent(enrollment.sectionId);
  if (!visibleSectionIds.length) return false;
  const match = await AssessmentSection.findOne({ where: { assessmentId: assessment.id, sectionId: visibleSectionIds } });
  return !!match;
}

exports.showAssessment = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({ where: { userId: req.currentUser.id } });
  const assessment = await Assessment.findOne({
    where: { id: req.params.id },
    include: [{ model: SubjectOffering, include: [SubjectPool] }],
  });
  if (!assessment) return res.status(404).render("error", { title: "Not found", message: "Assessment not found." });

  const enrollment = await SubjectEnrollment.findOne({
    where: { subjectOfferingId: assessment.subjectOfferingId, studentId: studentProfile.id },
  });
  if (!enrollment) return res.status(403).render("error", { title: "Forbidden", message: "You are not enrolled in this subject." });

  if (!(await assertVisible(assessment, enrollment))) {
    return res.status(403).render("error", { title: "Forbidden", message: "This assessment isn't assigned to your section." });
  }

  const existingSubmission = await Submission.findOne({ where: { assessmentId: assessment.id, studentId: studentProfile.id } });
  const override = await AssessmentStudentOverride.findOne({ where: { assessmentId: assessment.id, studentId: studentProfile.id } });

  const descriptionHtml = Array.isArray(assessment.description) ? renderBlocks(assessment.description) : "";

  res.render("student/assessment-detail", { title: assessment.title, assessment, descriptionHtml, enrollment, existingSubmission, override, error: null, breadcrumbs: [ROOT, { label: assessment.title }] });
};

exports.submitAssessment = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({ where: { userId: req.currentUser.id } });
  const assessment = await Assessment.findByPk(req.params.id);
  if (!assessment) return res.redirect("/student/dashboard");

  const enrollment = await SubjectEnrollment.findOne({
    where: { subjectOfferingId: assessment.subjectOfferingId, studentId: studentProfile.id },
  });
  if (!enrollment) return res.status(403).render("error", { title: "Forbidden", message: "You are not enrolled in this subject." });

  if (!(await assertVisible(assessment, enrollment))) {
    return res.status(403).render("error", { title: "Forbidden", message: "This assessment isn't assigned to your section." });
  }

  const override = await AssessmentStudentOverride.findOne({ where: { assessmentId: assessment.id, studentId: studentProfile.id } });
  const windowStart = override && override.startAt ? new Date(override.startAt) : new Date(assessment.startAt);
  const windowEnd = override && override.endAt ? new Date(override.endAt) : new Date(assessment.endAt);
  const now = new Date();

  if (now < windowStart) {
    return res.status(403).render("error", { title: "Not yet open", message: "This assessment isn't open for submissions yet." });
  }

  const isLate = now > windowEnd;

  const { url, description } = req.body;
  await Submission.upsert({
    assessmentId: assessment.id,
    studentId: studentProfile.id,
    sectionId: enrollment.sectionId,
    url: url || null,
    description: description || null,
    status: "PENDING",
    submittedAt: now,
    isLate,
  });

  res.redirect("/student/dashboard");
};

// --- Profile: pick a section later if it wasn't chosen (or wasn't
// available) at signup ---

exports.showProfile = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({
    where: { userId: req.currentUser.id },
    include: [Program, { model: Section, as: "currentSection" }],
  });

  let availableSections = [];
  if (!studentProfile.currentSectionId) {
    availableSections = await sectionsFor({
      programId: studentProfile.programId,
      admissionYear: studentProfile.admissionYear,
      semesterNumber: studentProfile.currentSemesterNumber,
    });
  }

  res.render("student/profile", {
    title: "My Profile",
    studentProfile,
    availableSections,
    error: null,
    breadcrumbs: [ROOT, { label: "My Profile" }],
  });
};

exports.chooseSection = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({
    where: { userId: req.currentUser.id },
    include: [Program, { model: Section, as: "currentSection" }],
  });

  // Once a section is set, changing it here would silently disconnect the
  // student from any teacher mappings/enrollments already tied to their
  // current one — that needs an admin's eyes, not a one-click self-service
  // change. This route only ever fills in an EMPTY section.
  if (studentProfile.currentSectionId) {
    return res.redirect("/student/profile");
  }

  const { sectionId, subGroupId } = req.body;
  const availableSections = await sectionsFor({
    programId: studentProfile.programId,
    admissionYear: studentProfile.admissionYear,
    semesterNumber: studentProfile.currentSemesterNumber,
  });

  const rerender = (error) =>
    res.status(400).render("student/profile", {
      title: "My Profile", studentProfile, availableSections, error,
      breadcrumbs: [ROOT, { label: "My Profile" }],
    });

  if (!sectionId) return rerender("Please select a section.");

  // Validate the chosen (sub-)section actually belongs to one of the
  // options offered — never trust the posted id blindly.
  const chosenTop = availableSections.find((s) => s.id === sectionId);
  if (!chosenTop) return rerender("That section isn't available for your program/semester. Please pick from the list.");
  if (subGroupId && !(chosenTop.subGroups || []).some((g) => g.id === subGroupId)) {
    return rerender("That sub-group doesn't belong to the selected section.");
  }

  studentProfile.currentSectionId = subGroupId || sectionId;
  await studentProfile.save();

  // If the student is already verified, auto-enroll them in active offerings now that section is set
  if (studentProfile.isVerified) {
    try {
      await enrollStudentInOfferings(studentProfile);
    } catch (err) {
      // Log and continue
    }
  }

  res.redirect("/student/profile");
};
