module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "SubjectEnrollment",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      // False once the student has moved out of this offering's placement (a different
      // semester / program / year / specialization). The row is KEPT, never deleted, so
      // past submissions and results stay attached to a real enrollment. Everything that
      // asks "who is in this class NOW" (teacher roster, who receives new assessments)
      // must filter isActive: true; history views must not.
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      endedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "subject_enrollments",
      indexes: [{ unique: true, fields: ["subject_offering_id", "student_id"] }],
    }
  );
};
