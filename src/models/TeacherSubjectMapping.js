// NOTE on the conflict rule: Sequelize (like Prisma) can't express a
// *partial* unique index purely through model options across both SQLite
// and Postgres cleanly. The safe approach used here:
//   1) A plain unique index on (subject_offering_id, section_id) covers
//      the "same teacher/section pair twice" case at the DB level.
//   2) The *cross-teacher* conflict check ("teacher B tries to map a
//      section teacher A already holds") is enforced in the service layer
//      (see controllers/teacherMappingController.js) with a pre-check +
//      a friendly 409 response naming the conflicting teacher, run inside
//      a transaction to avoid a race between two admins mapping at once.
//   3) Once on Postgres, add the two partial unique indexes described in
//      the schema doc as a raw migration for a second, DB-level guarantee.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "TeacherSubjectMapping",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      // sectionId is nullable at the association level: null = mapped to ALL sections of the offering
    },
    {
      tableName: "teacher_subject_mappings",
      indexes: [{ unique: true, fields: ["subject_offering_id", "section_id"] }],
    }
  );
};
