// sectionId is copied from the student's SubjectEnrollment at submission
// time so the teacher dashboard can filter/group "which class did this
// come from" directly with a WHERE/GROUP BY on this table alone.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Submission",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      fileUrl: { type: DataTypes.STRING, allowNull: true },
      url: { type: DataTypes.STRING, allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM("PENDING", "REJECTED", "EVALUATED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      marksObtained: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      submittedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      isLate: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    {
      tableName: "submissions",
      indexes: [{ unique: true, fields: ["assessment_id", "student_id"] }],
    }
  );
};
