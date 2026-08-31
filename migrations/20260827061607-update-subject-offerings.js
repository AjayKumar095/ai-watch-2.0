'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Adds SubjectOffering.isActive. Guarded with describeTable so this is
  // safe to run twice: on a FRESH database the baseline migration already
  // creates this column (it reflects the current models), so this becomes
  // a no-op there — it only actually does work on databases created before
  // this field existed (i.e. your current dev.sqlite3).
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('subject_offerings');
    if (!table.is_active) {
      await queryInterface.addColumn('subject_offerings', 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('subject_offerings');
    if (table.is_active) {
      await queryInterface.removeColumn('subject_offerings', 'is_active');
    }
  },
};

