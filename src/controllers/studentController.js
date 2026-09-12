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
  TeacherProfile,
  User,
} = require("../models");
const { visibleSectionIdsForStudent } = require("../services/sectionScope");
const { sectionsFor } = require("../services/sectionLookupService");
const { enrollStudentInOfferings } = require("../services/enrollmentService");
const renderBlocks = require("../utils/renderBlocks");

const ROOT = { label: "Dashboard", url: "/student/dashboard" };

// Resolves this student's current top-level Section's sub-groups — PG-1,
// PG-2, G1, G2, or whatever your admins named them — scoped the same way
// every other section option is resolved: program + admission year +
// semester (see sectionLookupService.sectionsFor, also used by
// showProfile/chooseSection below). Returns [] if the student has no
// section yet, is already IN a sub-group (so no further confirmation is
// possible), or their section simply has no sub-groups defined.
async function getSubGroupsForCurrentSection(studentProfile) {
  if (!studentProfile.currentSectionId) return [];

  const options = await sectionsFor({
    programId: studentProfile.programId,
    admissionYear: studentProfile.admissionYear,
    semesterNumber: studentProfile.currentSemesterNumber,
  });

  // sectionsFor only returns TOP-LEVEL sections for this cohort. If the
  // student's currentSectionId isn't in this list, they're either already
  // sitting in a sub-group themselves, or their section isn't part of this
  // cohort's active options — either way, nothing further to confirm.
  const current = options.find((s) => s.id === studentProfile.currentSectionId);
  return current ? current.subGroups || [] : [];
}

async function sectionNeedsConfirmation(studentProfile) {
  if (!studentProfile.currentSectionId || studentProfile.sectionConfirmed) return false;
  const subGroups = await getSubGroupsForCurrentSection(studentProfile);
  return subGroups.length > 0;
}

// Resolves this student's TOP-LEVEL section id and its subgroups,
// regardless of whether currentSectionId currently points at that
// top-level section itself or at one of its subgroups already. Used by the
// persistent "set/change your group" control on the profile page — unlike
// getSubGroupsForCurrentSection above (which is only for the one-time
// onboarding gate and intentionally returns [] once a subgroup is picked),
// this needs to keep working afterwards so the student can change their
// mind later.
async function getTopLevelSectionAndSubGroups(studentProfile) {
  if (!studentProfile.currentSectionId) return { topLevelId: null, subGroups: [] };

  const options = await sectionsFor({
    programId: studentProfile.programId,
    admissionYear: studentProfile.admissionYear,
    semesterNumber: studentProfile.currentSemesterNumber,
  });

  const asTopLevel = options.find((s) => s.id === studentProfile.currentSectionId);
  if (asTopLevel) return { topLevelId: asTopLevel.id, subGroups: asTopLevel.subGroups || [] };

  for (const s of options) {
    if ((s.subGroups || []).some((g) => g.id === studentProfile.currentSectionId)) {
      return { topLevelId: s.id, subGroups: s.subGroups || [] };
    }
  }

  // currentSectionId doesn't match anything sectionsFor currently returns
  // for this cohort (e.g. a section from a differently-configured
  // program/year) — nothing safe to offer.
  return { topLevelId: null, subGroups: [] };
}

exports.dashboard = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({
    where: { userId: req.currentUser.id },
    include: [Program, { model: Section, as: "currentSection" }],
  });

  if (await sectionNeedsConfirmation(studentProfile)) {
    return res.redirect("/student/confirm-section");
  }

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

// --- Confirm PG/group (one-time, optional) -------------------------------
// Shown when a student's account already has a top-level Section but no
// one has ever pinned down which sub-group/PG they're actually in — most
// commonly because an admin created the account and assigned the Section
// without knowing the PG split. This is a soft gate off the dashboard, not
// a hard block: skipping it is a valid, permanent choice (sectionConfirmed
// still flips to true), same as picking a group.

async function loadMentorContact(studentProfile) {
  // "Mentor" = the teacher who requested/approved this student's account.
  // Falls back to null if there's no ApprovalRequest on file (e.g. an
  // admin-created account with no approval flow), and the view shows a
  // generic "contact your admin" message in that case.
  const approval = await ApprovalRequest.findOne({
    where: { studentId: studentProfile.id },
    include: [{ model: TeacherProfile, as: "requestedTeacher", include: [User] }],
  });
  if (!approval || !approval.requestedTeacher || !approval.requestedTeacher.User) return null;
  const u = approval.requestedTeacher.User;
  return { name: `${u.firstName} ${u.lastName}`, email: u.email };
}

exports.showConfirmSection = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({
    where: { userId: req.currentUser.id },
    include: [Program, { model: Section, as: "currentSection" }],
  });

  if (!(await sectionNeedsConfirmation(studentProfile))) {
    return res.redirect("/student/dashboard");
  }

  const subGroups = await getSubGroupsForCurrentSection(studentProfile);
  const mentor = await loadMentorContact(studentProfile);

  res.render("student/confirm-section", {
    title: "Confirm Your Section",
    studentProfile,
    subGroups,
    mentor,
    error: null,
    breadcrumbs: [ROOT, { label: "Confirm Your Section" }],
  });
};

exports.confirmSection = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({
    where: { userId: req.currentUser.id },
    include: [Program, { model: Section, as: "currentSection" }],
  });

  if (!(await sectionNeedsConfirmation(studentProfile))) {
    return res.redirect("/student/dashboard");
  }

  const subGroups = await getSubGroupsForCurrentSection(studentProfile);
  const { subGroupId } = req.body;

  if (subGroupId) {
    const chosen = subGroups.find((g) => g.id === subGroupId);
    if (!chosen) {
      const mentor = await loadMentorContact(studentProfile);
      return res.status(400).render("student/confirm-section", {
        title: "Confirm Your Section",
        studentProfile,
        subGroups,
        mentor,
        error: "That group doesn't belong to your section. Please pick from the list, or skip for now.",
        breadcrumbs: [ROOT, { label: "Confirm Your Section" }],
      });
    }
    studentProfile.currentSectionId = subGroupId;
  }

  // Whether they picked a group or explicitly skipped, this is a settled,
  // one-time decision — don't ask again on future logins.
  studentProfile.sectionConfirmed = true;
  await studentProfile.save();

  res.redirect("/student/dashboard");
};

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

  const { subGroups } = await getTopLevelSectionAndSubGroups(studentProfile);

  res.render("student/profile", {
    title: "My Profile",
    studentProfile,
    availableSections,
    subGroups,
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

  const rerender = async (error) => {
    const { subGroups } = await getTopLevelSectionAndSubGroups(studentProfile);
    return res.status(400).render("student/profile", {
      title: "My Profile", studentProfile, availableSections, subGroups, error,
      breadcrumbs: [ROOT, { label: "My Profile" }],
    });
  };

  if (!sectionId) return rerender("Please select a section.");

  // Validate the chosen (sub-)section actually belongs to one of the
  // options offered — never trust the posted id blindly.
  const chosenTop = availableSections.find((s) => s.id === sectionId);
  if (!chosenTop) return rerender("That section isn't available for your program/semester. Please pick from the list.");
  if (subGroupId && !(chosenTop.subGroups || []).some((g) => g.id === subGroupId)) {
    return rerender("That sub-group doesn't belong to the selected section.");
  }

  studentProfile.currentSectionId = subGroupId || sectionId;
  studentProfile.sectionConfirmed = true;
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

// --- Set/change group from the profile page (persistent, not one-time) --
// Unlike confirmSection (the one-time onboarding gate) and chooseSection
// (only for a student with NO section yet), this is always available once
// a section with subgroups exists — a student can come back and change
// their mind, e.g. if they picked the wrong PG the first time.
exports.updateSubGroup = async (req, res) => {
  const studentProfile = await StudentProfile.findOne({
    where: { userId: req.currentUser.id },
    include: [Program, { model: Section, as: "currentSection" }],
  });

  const { topLevelId, subGroups } = await getTopLevelSectionAndSubGroups(studentProfile);

  const rerender = async (error) => {
    let availableSections = [];
    if (!studentProfile.currentSectionId) {
      availableSections = await sectionsFor({
        programId: studentProfile.programId,
        admissionYear: studentProfile.admissionYear,
        semesterNumber: studentProfile.currentSemesterNumber,
      });
    }
    return res.status(400).render("student/profile", {
      title: "My Profile", studentProfile, availableSections, subGroups, error,
      breadcrumbs: [ROOT, { label: "My Profile" }],
    });
  };

  if (!subGroups.length) {
    return rerender("Your section doesn't have any groups set up right now.");
  }

  const { subGroupId } = req.body;

  if (!subGroupId) {
    // "None" — revert to the plain top-level section.
    if (!topLevelId) return rerender("Couldn't resolve your section. Please contact your mentor.");
    studentProfile.currentSectionId = topLevelId;
  } else {
    const chosen = subGroups.find((g) => g.id === subGroupId);
    if (!chosen) return rerender("That group doesn't belong to your section.");
    studentProfile.currentSectionId = subGroupId;
  }

  // An explicit choice here always counts as "confirmed" too, in case this
  // student still had the one-time confirm-section prompt pending.
  studentProfile.sectionConfirmed = true;
  await studentProfile.save();

  res.redirect("/student/profile");
};
