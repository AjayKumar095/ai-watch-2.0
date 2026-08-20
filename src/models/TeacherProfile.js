// No is_hod / incharge_* fields — class in-charge is replaced by
// ApprovalRequest (see that model).
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "TeacherProfile",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      employeeCode: { type: DataTypes.STRING, allowNull: false, unique: true },
      designation: { type: DataTypes.STRING, allowNull: true },
    },
    { tableName: "teacher_profiles" }
  );
};
