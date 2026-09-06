module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "PromotionBatch",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      // The cohort being promoted — same value the students in it already
      // have on their own admissionYear, since promotion never changes it.
      // "When (real-world time) did this run" is executedAt below, not a
      // second year field — there's nothing else it could usefully record.
      admissionYear: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING, defaultValue: "PENDING_REVIEW" }, // PENDING_REVIEW | COMMITTED | CANCELLED
      executedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { tableName: "promotion_batches" }
  );
};
