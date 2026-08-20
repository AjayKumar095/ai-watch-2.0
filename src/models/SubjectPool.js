module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "SubjectPool",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      category: {
        type: DataTypes.ENUM("UNIVERSITY_WIDE", "PROGRAM_SPECIFIC"),
        allowNull: false,
        defaultValue: "UNIVERSITY_WIDE",
      },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "subject_pool" }
  );
};
