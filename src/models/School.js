module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "School",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "schools" }
  );
};
