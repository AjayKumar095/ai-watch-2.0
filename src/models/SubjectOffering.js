module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "SubjectOffering",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      semesterNumber: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      tableName: "subject_offerings",
      indexes: [
        {
          unique: true,
          fields: ["subject_id", "program_id", "semester_number", "specialization_id", "academic_session_id"],
        },
      ],
    }
  );
};
