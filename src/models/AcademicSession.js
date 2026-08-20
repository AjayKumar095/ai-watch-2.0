module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AcademicSession",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      label: { type: DataTypes.STRING, allowNull: false, unique: true }, // e.g. "2026-2027"
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "academic_sessions" }
  );
};
