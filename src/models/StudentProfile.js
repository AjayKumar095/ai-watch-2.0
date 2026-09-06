module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "StudentProfile",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      rollNo: { type: DataTypes.STRING, allowNull: false, unique: true },
      // Fixed at signup, never changed afterwards (not even by promotion —
      // see promotionService.js). This is what lets a fresh admit and a
      // continuing student coexist in the same real-world year while each
      // following the subject-offering policy (credit-bearing "AI"-coded
      // vs non-credit "VA"-coded) that applied when THEY were admitted.
      admissionYear: { type: DataTypes.INTEGER, allowNull: false },
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
