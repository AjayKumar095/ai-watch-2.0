module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "PromotionRecord",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      fromSemester: { type: DataTypes.INTEGER, allowNull: false },
      toSemester: { type: DataTypes.INTEGER, allowNull: true },
      result: { type: DataTypes.ENUM("PROMOTED", "GRADUATED", "HELD_BACK"), allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "promotion_records" }
  );
};
