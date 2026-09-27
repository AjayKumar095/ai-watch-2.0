'use strict';

/** @type {import('sequelize-cli').Migration} */

// Adds an optional AI-proficiency level to subject_pool, matching the same
// label set utils/courseLevel.js's extractLevel() looks for embedded in a
// PROGRAM name (Essentials / Fundamentals / Intermediate / Advance).
// Nullable — plain subjects with no AI-proficiency level (e.g. a B.Sc
// elective) simply leave this blank.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("subject_pool", "level", {
      type: Sequelize.ENUM("Essentials", "Fundamentals", "Applied", "Intermediate", "Advance", "Expert", "Specialized", "Mastery"),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("subject_pool", "level");
    // Postgres leaves the enum TYPE behind after the column itself is
    // dropped (SQLite/MySQL have no separate enum type to clean up) — drop
    // it explicitly so re-running `up` later doesn't collide with a stale
    // type of the same name.
    if (queryInterface.sequelize.getDialect() === "postgres") {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_subject_pool_level";');
    }
  },
};
