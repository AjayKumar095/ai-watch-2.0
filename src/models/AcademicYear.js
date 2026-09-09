module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AcademicYear",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      yearStart: { type: DataTypes.INTEGER, allowNull: false },
      yearEnd: { type: DataTypes.INTEGER, allowNull: false },
      label: { type: DataTypes.STRING, allowNull: false },
      admissionYear: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
      isCurrent: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    {
      tableName: "academic_years",
      timestamps: true,
    }
  );
};
