module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "PromotionBatch",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      status: { type: DataTypes.STRING, defaultValue: "PENDING_REVIEW" }, // PENDING_REVIEW | COMMITTED | CANCELLED
      executedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { tableName: "promotion_batches" }
  );
};
