module.exports = (sequelize, DataTypes) => {
  const AssessmentLock = sequelize.define(
    "AssessmentLock",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      isLocked: { type: DataTypes.BOOLEAN, defaultValue: false },
      lockedAt: { type: DataTypes.DATE, allowNull: true },
      // NEW — who locked/unlocked it last, for audit + "only the owning
      // teacher can unlock" checks in the controller. Add these two columns
      // via migration if they don't already exist on assessment_locks.
      lockedById: { type: DataTypes.UUID, allowNull: true },
      unlockedAt: { type: DataTypes.DATE, allowNull: true },
      unlockedById: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "assessment_locks",
      indexes: [{ unique: true, fields: ["subject_offering_id", "section_id"] }],
    }
  );

  AssessmentLock.associate = (models) => {
    AssessmentLock.belongsTo(models.SubjectOffering, { foreignKey: "subjectOfferingId" });
    AssessmentLock.belongsTo(models.Section, { foreignKey: "sectionId" });
    AssessmentLock.belongsTo(models.User, { as: "LockedBy", foreignKey: "lockedById" });
    AssessmentLock.belongsTo(models.User, { as: "UnlockedBy", foreignKey: "unlockedById" });
  };

  return AssessmentLock;
};
