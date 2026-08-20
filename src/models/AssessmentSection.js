// Explicit many-to-many join: an Assessment applies to exactly the
// sections selected here, so "I teach 2 of 3 sections" and "one
// assessment, duplicated per section" are both fixed by construction.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AssessmentSection",
    {},
    {
      tableName: "assessment_sections",
      indexes: [{ unique: true, fields: ["assessment_id", "section_id"] }],
    }
  );
};
