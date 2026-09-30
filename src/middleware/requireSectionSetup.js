const { StudentProfile } = require("../models");

// A student "in setup" is one who was promoted into a later semester
// (promotionService nulls currentSectionId on promotion, because sections are
// scoped per program+semester+admissionYear and last semester's section has
// no valid equivalent) and hasn't yet picked their section/sub-group for it.
//
// Deliberately limited to currentSemesterNumber > 1: a brand-new Sem 1
// student with no section keeps the existing optional behaviour (they can
// pick one later from their profile, per showProfile's own comments) —
// this gate is only for the post-promotion case.
function isPromotedWithoutSection(studentProfile) {
  return !!studentProfile && !studentProfile.currentSectionId && studentProfile.currentSemesterNumber > 1;
}

// Blocks the dashboard and assessment routes until section setup is done.
// The profile page (where the section is chosen), certificates (a promoted
// student still needs to download last semester's), and logout are left
// open on purpose so a student is never locked out of something they can't
// unblock themselves.
async function requireSectionSetup(req, res, next) {
  const studentProfile = await StudentProfile.findOne({
    where: { userId: req.currentUser.id },
    attributes: ["id", "currentSectionId", "currentSemesterNumber"],
  });
  if (isPromotedWithoutSection(studentProfile)) return res.redirect("/student/profile");
  next();
}

module.exports = requireSectionSetup;
module.exports.isPromotedWithoutSection = isPromotedWithoutSection;
