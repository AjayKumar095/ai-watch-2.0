module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "ProgramOffering",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      semesterNumber: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      tableName: "program_offerings",
      indexes: [{ unique: true, fields: ["program_id", "semester_number", "academic_session_id"] }],
    }
  );
};
