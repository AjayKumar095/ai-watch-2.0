"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "teacher_subject_mapping_specializations",
      {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
        },

        mapping_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: "teacher_subject_mappings",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },

        specialization_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: "specializations",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },

        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      }
    );

    await queryInterface.addIndex(
      "teacher_subject_mapping_specializations",
      ["mapping_id", "specialization_id"],
      {
        unique: true,
        name: "teacher_subject_mapping_specializations_unique",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable(
      "teacher_subject_mapping_specializations"
    );
  },
};