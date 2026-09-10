module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "TeacherSubjectMappingSpecialization",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      mappingId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "mapping_id",
      },

      specializationId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "specialization_id",
      },
    },
    {
      tableName: "teacher_subject_mapping_specializations",

      indexes: [
        {
          unique: true,
          fields: ["mapping_id", "specialization_id"],
          name: "teacher_mapping_specialization_unique",
        },
      ],
    }
  );
};