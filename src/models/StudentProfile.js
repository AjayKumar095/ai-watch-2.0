module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "StudentProfile",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      rollNo: { type: DataTypes.STRING, allowNull: false, unique: true },
      currentSemesterNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: {
        type: DataTypes.ENUM("ACTIVE", "GRADUATED", "ON_HOLD"),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: "student_profiles" }
  );
};
