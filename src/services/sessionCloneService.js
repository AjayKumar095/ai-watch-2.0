// Clones a program's academic structure (ProgramOffering -> Sections ->
// SubjectOfferings -> TeacherSubjectMappings) forward from one session to
// another. Most departments only need to tweak a handful of teacher
// reassignments after this runs — see architecture report §7.3.
const {
  sequelize,
  ProgramOffering,
  Section,
  SubjectOffering,
  TeacherSubjectMapping,
} = require("../models");

async function cloneSessionForward({ programId, fromSessionId, toSessionId }) {
  return sequelize.transaction(async (t) => {
    const summary = { offerings: 0, sections: 0, subjectOfferings: 0, mappings: 0, skipped: [] };

    const sourceOfferings = await ProgramOffering.findAll({
      where: { programId, academicSessionId: fromSessionId },
      include: [Section],
      transaction: t,
    });

    // Map old ProgramOffering id -> new ProgramOffering id, and old Section
    // id -> new Section id, since sub-groups reference their parent by id.
    const offeringIdMap = {};
    const sectionIdMap = {};

    for (const srcOffering of sourceOfferings) {
      const [newOffering, offeringCreated] = await ProgramOffering.findOrCreate({
        where: { programId, semesterNumber: srcOffering.semesterNumber, academicSessionId: toSessionId },
        defaults: {},
        transaction: t,
      });
      offeringIdMap[srcOffering.id] = newOffering.id;
      if (offeringCreated) summary.offerings++;

      // Clone top-level sections first, then sub-groups (which need the parent's new id).
      const topSections = srcOffering.Sections.filter((s) => !s.parentSectionId);
      const subGroups = srcOffering.Sections.filter((s) => s.parentSectionId);

      for (const srcSection of topSections) {
        const [newSection, created] = await Section.findOrCreate({
          where: { programOfferingId: newOffering.id, parentSectionId: null, name: srcSection.name },
          defaults: { kind: srcSection.kind, capacity: srcSection.capacity },
          transaction: t,
        });
        sectionIdMap[srcSection.id] = newSection.id;
        if (created) summary.sections++;
      }
      for (const srcSection of subGroups) {
        const newParentId = sectionIdMap[srcSection.parentSectionId];
        if (!newParentId) continue; // parent wasn't cloned (shouldn't happen, but stay safe)
        const [newSection, created] = await Section.findOrCreate({
          where: { programOfferingId: newOffering.id, parentSectionId: newParentId, name: srcSection.name },
          defaults: { kind: srcSection.kind, capacity: srcSection.capacity },
          transaction: t,
        });
        sectionIdMap[srcSection.id] = newSection.id;
        if (created) summary.sections++;
      }
    }

    // Clone SubjectOfferings for this program + these semesters, then their mappings.
    const semesterNumbers = sourceOfferings.map((o) => o.semesterNumber);
    const sourceSubjectOfferings = await SubjectOffering.findAll({
      where: { programId, academicSessionId: fromSessionId, semesterNumber: semesterNumbers },
      include: [{ model: TeacherSubjectMapping }],
      transaction: t,
    });

    for (const srcSO of sourceSubjectOfferings) {
      const [newSO, soCreated] = await SubjectOffering.findOrCreate({
        where: {
          subjectId: srcSO.subjectId,
          programId,
          semesterNumber: srcSO.semesterNumber,
          specializationId: srcSO.specializationId,
          academicSessionId: toSessionId,
        },
        defaults: {},
        transaction: t,
      });
      if (soCreated) summary.subjectOfferings++;

      for (const srcMapping of srcSO.TeacherSubjectMappings || []) {
        const newSectionId = srcMapping.sectionId ? sectionIdMap[srcMapping.sectionId] : null;
        if (srcMapping.sectionId && !newSectionId) {
          summary.skipped.push(`Mapping for teacher ${srcMapping.teacherId} referenced a section that wasn't cloned.`);
          continue;
        }
        const [, mappingCreated] = await TeacherSubjectMapping.findOrCreate({
          where: { teacherId: srcMapping.teacherId, subjectOfferingId: newSO.id, sectionId: newSectionId },
          defaults: {},
          transaction: t,
        });
        if (mappingCreated) summary.mappings++;
      }
    }

    return summary;
  });
}

module.exports = { cloneSessionForward };
