"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeIndex(
      "teacher_subject_mappings",
      "teacher_subject_mapping_offering_section_unique"
    );

    await queryInterface.addIndex(
      "teacher_subject_mappings",
      ["subject_offering_id", "section_id"],
      {
        name: "teacher_subject_mapping_offering_section_idx",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "teacher_subject_mappings",
      "teacher_subject_mapping_offering_section_idx"
    );

    await queryInterface.addIndex(
      "teacher_subject_mappings",
      ["subject_offering_id", "section_id"],
      {
        unique: true,
        name: "teacher_subject_mapping_offering_section_unique",
      }
    );
  },
};