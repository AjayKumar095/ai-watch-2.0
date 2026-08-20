module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "SemesterCertificate",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      semesterNumber: { type: DataTypes.INTEGER, allowNull: false },
      verificationCode: { type: DataTypes.STRING, allowNull: false, unique: true },
      aiLevel: { type: DataTypes.STRING, allowNull: true },
      issuedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "semester_certificates",
      indexes: [{ unique: true, fields: ["student_id", "program_id", "semester_number", "academic_session_id"] }],
    }
  );
};
