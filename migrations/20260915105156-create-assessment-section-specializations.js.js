"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("assessment_section_specializations", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      assessment_section_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "assessment_sections", key: "id" },
        onDelete: "CASCADE",
      },
      specialization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "specializations", key: "id" },
        onDelete: "CASCADE",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    await queryInterface.addIndex("assessment_section_specializations", ["assessment_section_id", "specialization_id"], {
      unique: true,
      name: "assessment_section_specialization_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("assessment_section_specializations");
  },
};