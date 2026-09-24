"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("assessment_section_specializations", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      // INTEGER, not UUID: assessment_sections.id is a default Sequelize
      // auto-increment integer PK (that model never explicitly declared a
      // UUID id like every other table in this app does), so this FK has
      // to match that real column type. This is the exact fix for the
      // earlier failed attempt.
      assessment_section_id: {
        type: Sequelize.INTEGER,
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
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
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