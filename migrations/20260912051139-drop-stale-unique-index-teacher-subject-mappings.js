"use strict";

// Drops any stale UNIQUE index on teacher_subject_mappings other than the
// primary key. Before the Teacher -> Subject Offering -> Section ->
// Specialization(s) redesign, a raw migration may have added a partial
// unique index on (subject_offering_id, section_id) as a "belt and
// braces" DB-level guarantee (see the comment block at the top of
// models/TeacherSubjectMapping.js). That guarantee is now WRONG: the app
// intentionally allows two mappings to share the same subject_offering_id
// + section_id as long as their specializations don't overlap (e.g.
// Teacher A -> Section C -> PG-1..5, Teacher B -> Section C -> PG-6).
// Sequelize's own model-level index on this table
// ("teacher_subject_mapping_offering_section_idx") is NOT unique, so it's
// left alone — only a UNIQUE index is a leftover from the old design.
//
// Postgres-only: per the model's own comment, that raw partial-unique-index
// migration was only ever applied "once on Postgres" — SQLite (used in
// dev) never had it, and SQLite doesn't have pg_indexes/ILIKE anyway. This
// migration no-ops cleanly everywhere except Postgres so it's safe to run
// in any environment.
//
// Run this diagnostic first on Postgres to see what's actually there
// before trusting this migration blindly:
//   SELECT indexname, indexdef FROM pg_indexes
//   WHERE tablename = 'teacher_subject_mappings';

module.exports = {
  async up(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== "postgres") {
      return; // nothing to do on SQLite/MySQL/etc. — this issue is Postgres-only
    }

    const [indexes] = await queryInterface.sequelize.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'teacher_subject_mappings'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexname NOT LIKE '%_pkey';
    `);

    for (const row of indexes) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${row.indexname}";`);
    }
  },

  async down() {
    // Intentionally irreversible: we don't know the exact original
    // definition of whatever got dropped, and recreating a blanket
    // (subject_offering_id, section_id) unique constraint would just
    // reintroduce this exact bug. Specialization-aware conflict checking
    // in services/teacherMappingService.js is the correct source of truth
    // now — see its "Load existing mappings" step + the overlap logic
    // right after it.
  },
};