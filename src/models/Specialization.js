module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Specialization",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: "specializations",
      indexes: [{ unique: true, fields: ["program_id", "name"] }],
    }
  );
};
