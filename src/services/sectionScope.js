// Resolves section-hierarchy visibility rules used across teacher mapping,
// assessment targeting, and student-side visibility. Central place for the
// "whole Section covers its sub-groups; a sub-group mapping is scoped to
// just that sub-group" rule so it's applied consistently everywhere,
// instead of being reimplemented (and drifting) per view.
//
// Also now the central place for the SPECIALIZATION dimension of that same
// rule. TeacherSubjectMapping has always supported "PG-1, PG-2 only" style
// scoping via TeacherSubjectMappingSpecialization, but that scope was never
// carried through to Assessment/AssessmentSection — so an assessment
// created by a teacher mapped to only PG-1..5 of a section was still
// visible (and submittable) to that section's PG-6 students, who belong to
// a different teacher's mapping entirely. AssessmentSectionSpecialization
// mirrors TeacherSubjectMappingSpecialization exactly (same "zero rows =
// ALL" convention) to close that gap.
const { Section, SubjectEnrollment, StudentProfile, User } = require("../models");

// For a TeacherSubjectMapping.sectionId (may be null = "all sections"):
// returns the list of concrete Section rows this teacher can target when
// creating an assessment.
//   - null            -> every TOP-LEVEL section under the offering (each
//                         one implicitly covers its own sub-groups)
//   - a top-level id   -> that one section (covers its sub-groups)
//   - a sub-group id   -> that one sub-group only
async function targetableSectionsForMapping(sectionId, programOfferingId) {
  if (!sectionId) {
    return Section.findAll({ where: { programOfferingId, parentSectionId: null } });
  }
  const section = await Section.findByPk(sectionId);
  return section ? [section] : [];
}

// For a student's own enrolled sectionId: returns every AssessmentSection
// sectionId value that should make an assessment visible to them — their
// own section, AND its parent if it's a sub-group (an assessment targeted
// at the parent "whole section" is visible to every sub-group under it).
async function visibleSectionIdsForStudent(studentSectionId) {
  if (!studentSectionId) return [];
  const section = await Section.findByPk(studentSectionId);
  if (!section) return [studentSectionId];
  return section.parentSectionId ? [section.id, section.parentSectionId] : [section.id];
}

// Given a TeacherSubjectMapping instance with its mappingSpecializations
// included, returns the array of specializationIds it's scoped to — []
// means ALL specializations. This is what a mapping's scope should be
// carried forward AS when it's used to target an assessment.
function specializationIdsForMapping(mapping) {
  return (mapping.mappingSpecializations || []).map((s) => s.specializationId);
}

// The actual match rule, shared by every visibility check below: does a
// student with the given specializationId fall within a target's
// specialization scope? targetSpecializationIds = [] means the target
// covers ALL specializations (same convention as TeacherSubjectMapping's
// conflict-check logic in teacherMappingService.js).
function specializationMatches(studentSpecializationId, targetSpecializationIds) {
  if (!targetSpecializationIds || targetSpecializationIds.length === 0) return true; // target = ALL
  if (!studentSpecializationId) return false; // target is specialization-scoped, student has none recorded
  return targetSpecializationIds.includes(studentSpecializationId);
}

// Given a subjectOfferingId and an array of AssessmentSection rows (each
// with sectionSpecializations included), returns the de-duplicated
// SubjectEnrollment rows (with StudentProfile+User) for exactly the
// students each target actually covers: expanding each targeted section to
// include its sub-groups, AND filtering by that target's own specialization
// scope. This is the single source of truth for "who can actually see/
// submit to this assessment" — used for the student-created notification
// list, the "open submission for selected students" override candidate
// list, and (in principle) anywhere else that needs the real audience for
// a set of AssessmentSection targets, so all three stay consistent instead
// of drifting into slightly different section-only logic.
async function enrollmentsForAssessmentSections(subjectOfferingId, assessmentSections) {
  const results = new Map(); // enrollment.id -> enrollment, de-duped across overlapping targets

  for (const as of assessmentSections) {
    const childSections = await Section.findAll({ where: { parentSectionId: as.sectionId } });
    const allSectionIds = [as.sectionId, ...childSections.map((s) => s.id)];
    const specializationIds = (as.sectionSpecializations || []).map((s) => s.specializationId);

    const enrollments = await SubjectEnrollment.findAll({
      where: { subjectOfferingId, sectionId: allSectionIds },
      include: [{ model: StudentProfile, include: [User] }],
    });

    for (const e of enrollments) {
      if (!specializationMatches(e.StudentProfile.specializationId, specializationIds)) continue;
      results.set(e.id, e);
    }
  }

  return Array.from(results.values());
}

module.exports = {
  targetableSectionsForMapping,
  visibleSectionIdsForStudent,
  specializationIdsForMapping,
  specializationMatches,
  enrollmentsForAssessmentSections,
};
