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
      // False when the account (or its current section) was set up without
      // the student ever confirming which sub-group/PG they belong to —
      // e.g. an admin assigning a top-level Section at account-creation
      // time without knowing the PG split. Drives the one-time "confirm
      // your section" prompt in studentController.js. Set true either when
      // the student explicitly picks a sub-group/skips via that prompt, or
      // when they make their first self-service section choice.
      sectionConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: "student_profiles" }
  );
};
