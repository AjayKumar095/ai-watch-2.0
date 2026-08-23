// Resolves section-hierarchy visibility rules used across teacher mapping,
// assessment targeting, and student-side visibility. Central place for the
// "whole Section covers its sub-groups; a sub-group mapping is scoped to
// just that sub-group" rule so it's applied consistently everywhere,
// instead of being reimplemented (and drifting) per view.
const { Section } = require("../models");

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

module.exports = { targetableSectionsForMapping, visibleSectionIdsForStudent };
