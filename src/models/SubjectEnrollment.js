module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "SubjectEnrollment",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    },
    {
      tableName: "subject_enrollments",
      indexes: [{ unique: true, fields: ["subject_offering_id", "student_id"] }],
    }
  );
};
