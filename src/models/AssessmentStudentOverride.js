module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AssessmentStudentOverride",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      startAt: { type: DataTypes.DATE, allowNull: true },
      endAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "assessment_student_overrides",
      indexes: [{ unique: true, fields: ["assessment_id", "student_id"] }],
    }
  );
};
