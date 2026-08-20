module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AssessmentLock",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      isLocked: { type: DataTypes.BOOLEAN, defaultValue: false },
      lockedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "assessment_locks",
      indexes: [{ unique: true, fields: ["subject_offering_id", "section_id"] }],
    }
  );
};
