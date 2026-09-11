module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "ProgramOffering",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      semesterNumber: { type: DataTypes.INTEGER, allowNull: false },
      admissionYear: { type: DataTypes.INTEGER, allowNull: false },
      // Lets an admin disable a semester after enabling it (previously
      // "ensureOffering" could only ever create/find one — there was no
      // way back). Purely a visibility/status flag on this model itself;
      // it does NOT automatically restrict SubjectOffering, enrollment,
      // or assessment queries elsewhere — those already have their own
      // isActive columns for that. See workspace.ejs toggle button.
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "program_offerings",
      indexes: [{ unique: true, fields: ["program_id", "semester_number", "admission_year"] }],
    }
  );
};
