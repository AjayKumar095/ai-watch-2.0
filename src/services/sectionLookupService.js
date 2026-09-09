const { ProgramOffering, Section } = require("../models");

// Used by both the public signup wizard (always semester 1, since new
// admits start there) and the student profile page (the student's actual
// current semester, which may be later if they signed up without picking
// a section and are choosing one after being promoted).
async function sectionsFor({ programId, admissionYear, semesterNumber }) {
  const offering = await ProgramOffering.findOne({
    where: { programId, admissionYear, semesterNumber },
  });
  if (!offering) return [];

  return Section.findAll({
    where: { programOfferingId: offering.id, parentSectionId: null },
    include: [{ model: Section, as: "subGroups" }],
    order: [["name", "ASC"]],
  });
}

module.exports = { sectionsFor };
