"use strict";

// Adds the "is this enrollment current?" flag to subject_enrollments.
// Existing rows become active (the default), so nothing changes until a student's
// semester / program / year / specialization is edited from the admin side.
//
// Run BEFORE deploying the new studentAdminController / teacherController / model:
//   npx sequelize-cli db:migrate
// (if the project applies hand-written migrations differently, run the equivalent SQL below)
//
//   ALTER TABLE subject_enrollments
//     ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
//     ADD COLUMN ended_at DATETIME NULL;
//   CREATE INDEX idx_subject_enrollments_student_active ON subject_enrollments (student_id, is_active);

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "subject_enrollments";
    const cols = await queryInterface.describeTable(table);
    if (!cols.is_active) {
      await queryInterface.addColumn(table, "is_active", { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true });
    }
    if (!cols.ended_at) {
      await queryInterface.addColumn(table, "ended_at", { type: Sequelize.DATE, allowNull: true });
    }
    await queryInterface.addIndex(table, ["student_id", "is_active"], { name: "idx_subject_enrollments_student_active" });
  },

  async down(queryInterface) {
    const table = "subject_enrollments";
    await queryInterface.removeIndex(table, "idx_subject_enrollments_student_active");
    await queryInterface.removeColumn(table, "ended_at");
    await queryInterface.removeColumn(table, "is_active");
  },
};
