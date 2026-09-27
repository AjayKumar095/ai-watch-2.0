"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("assessment_locks");

    if (!table.unlocked_at) {
      await queryInterface.addColumn("assessment_locks", "unlocked_at", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!table.unlocked_by_id) {
      await queryInterface.addColumn("assessment_locks", "unlocked_by_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("assessment_locks");

    if (table.unlocked_by_id) {
      await queryInterface.removeColumn(
        "assessment_locks",
        "unlocked_by_id"
      );
    }

    if (table.unlocked_at) {
      await queryInterface.removeColumn(
        "assessment_locks",
        "unlocked_at"
      );
    }
  },
};