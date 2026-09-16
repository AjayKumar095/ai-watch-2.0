// Carries a targeted AssessmentSection's specialization scope — mirrors
// TeacherSubjectMappingSpecialization exactly, including its convention:
// zero rows for a given assessment_section_id means "ALL specializations"
// (not "no specializations"). This is what was missing entirely before:
// TeacherSubjectMapping could be scoped to specific specializations
// (PG-1, PG-2, etc.), but AssessmentSection had no equivalent — so an
// assessment created by a teacher mapped to only PG-1..5 of a section was
// still visible to the section's PG-6 students too, who belong to a
// different teacher's mapping entirely.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AssessmentSectionSpecialization",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      // INTEGER, not UUID — see the migration's comment: assessment_sections
      // never explicitly declared a UUID id, so it got Sequelize's default
      // auto-increment INTEGER PK instead.
      assessmentSectionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "assessment_section_id",
      },
      specializationId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "specialization_id",
      },
    },
    {
      tableName: "assessment_section_specializations",
      indexes: [
        {
          unique: true,
          fields: ["assessment_section_id", "specialization_id"],
          name: "assessment_section_specialization_unique",
        },
      ],
    }
  );
};
