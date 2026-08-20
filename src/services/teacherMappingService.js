const { Op } = require("sequelize");
const { TeacherSubjectMapping, TeacherProfile, User } = require("../models");

// Enforces the teacher-subject-section conflict rule at the application
// layer (see schema notes: Sequelize/Postgres partial-unique-index caveat).
// Throws a MAPPING_CONFLICT error carrying the conflicting teacher's
// details so the caller can show a clear flag instead of a generic error.
async function createMapping({ teacherId, subjectOfferingId, sectionId }) {
  const { sequelize } = require("../models");
  return sequelize.transaction(async (t) => {
    const whereConflict = sectionId
      ? { subjectOfferingId, [Op.or]: [{ sectionId }, { sectionId: null }] }
      : { subjectOfferingId }; // requesting ALL sections conflicts with any existing mapping on this offering

    const existing = await TeacherSubjectMapping.findOne({
      where: whereConflict,
      include: [{ model: TeacherProfile, include: [User] }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (existing && existing.teacherId !== teacherId) {
      const err = new Error("MAPPING_CONFLICT");
      err.code = "MAPPING_CONFLICT";
      err.conflict = {
        teacherName: `${existing.TeacherProfile.User.firstName} ${existing.TeacherProfile.User.lastName}`,
        teacherEmail: existing.TeacherProfile.User.email,
        sectionId: existing.sectionId,
      };
      throw err;
    }

    if (existing && existing.teacherId === teacherId) {
      return existing; // already mapped, idempotent
    }

    return TeacherSubjectMapping.create({ teacherId, subjectOfferingId, sectionId: sectionId || null }, { transaction: t });
  });
}

module.exports = { createMapping };
