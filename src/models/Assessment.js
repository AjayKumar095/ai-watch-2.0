module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Assessment",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.JSON, allowNull: true },
      attachmentUrl: { type: DataTypes.STRING, allowNull: true },
      startAt: { type: DataTypes.DATE, allowNull: false },
      endAt: { type: DataTypes.DATE, allowNull: false },
      maxMarks: { type: DataTypes.DECIMAL(5, 1), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "assessments" }
  );
};
