"use strict";

// approval_requests.requested_teacher_id was only ever meaningful for the
// self-signup flow, where a student picks a teacher to review their
// request. Direct enrollment (controllers/enrollStudentController.js —
// singleEnroll/bulkEnroll) has no "requested teacher": the admin/teacher
// doing the enrolling IS the approver, so that ApprovalRequest is created
// with status "APPROVED" and no requestedTeacherId at all. Postgres was
// still enforcing NOT NULL on that column though (SQLite, used in dev,
// didn't catch this), so every direct/bulk enrollment failed in
// production with a raw DB error on the INSERT.
//
// Postgres-only, dialect-checked like the other migrations in this app
// that only ever needed a raw-SQL fix on the production database.

module.exports = {
  async up(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== "postgres") return;
    await queryInterface.sequelize.query(`
      ALTER TABLE approval_requests ALTER COLUMN requested_teacher_id DROP NOT NULL;
    `);
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== "postgres") return;
    // NOTE: irreversible if any row was inserted with a NULL
    // requested_teacher_id in the meantime (which is now expected/normal
    // for direct enrollments) — re-adding NOT NULL would fail on those
    // rows. Not attempting to auto-fix that here.
    await queryInterface.sequelize.query(`
      ALTER TABLE approval_requests ALTER COLUMN requested_teacher_id SET NOT NULL;
    `);
  },
};