module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Program",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      totalSemesters: { type: DataTypes.INTEGER, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: "programs",
      indexes: [{ unique: true, fields: ["school_id", "name"] }],
    }
  );
};
