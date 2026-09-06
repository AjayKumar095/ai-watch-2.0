'use strict';

// Removes the AcademicSession table/model in favor of a plain
// `admission_year` INTEGER column, added directly to every table that used
// to reference it via `academic_session_id` (or, on promotion_batches,
// `from_session_id`/`to_session_id`).
//
// Why: AcademicSession represented "which cycle does this belong to," but
// a student's own admission_year is a fixed, one-time value set at
// onboarding — it never changes, even as they're promoted through
// semesters (see promotionService.js). Routing that through a separate
// joined table added a layer of indirection with no real benefit once the
// session's start/end dates weren't used for anything beyond display. A
// plain integer column on each table gives the exact same scoping
// (Program + Semester + admission_year uniquely identifies a subject
// offering — which is what lets an old VA-coded, non-credit course and a
// new AI-coded, credit-bearing one coexist for different cohorts) with one
// fewer join and one fewer table to keep in sync.
//
// IMPORTANT SQLite gotcha found while building this: `queryInterface.
// removeColumn`/`changeColumn` on SQLite rebuild the table (copy to a temp
// table, drop the original, rename back) because SQLite has no native
// ALTER COLUMN. Dropping the ORIGINAL table mid-rebuild is enough to
// trigger SQLite's `ON DELETE CASCADE` against it — so removing a column
// from student_profiles that way silently deleted every row in
// semester_certificates, subject_enrollments, submissions, etc. (verified
// directly: seeded one of each, ran it, watched them disappear with no
// error thrown). Toggling `PRAGMA foreign_keys` around it doesn't help
// either — it's a documented no-op mid-transaction, and Sequelize's
// connection pool doesn't guarantee the pragma and the transaction share a
// connection anyway. The fix used throughout below: raw
// `ALTER TABLE ... DROP COLUMN`, which modern SQLite (3.35+; this project
// runs 3.52) supports natively with NO table rebuild at all — so there's
// nothing to trigger a cascade. `addColumn` and `removeIndex` were
// confirmed safe as-is (neither rebuilds the table).
const TABLES = ['student_profiles', 'program_offerings', 'subject_offerings', 'semester_certificates'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const table of TABLES) {
        await queryInterface.addColumn(table, 'admission_year', { type: Sequelize.INTEGER, allowNull: true }, { transaction: t });
      }
      await queryInterface.addColumn('promotion_batches', 'admission_year', { type: Sequelize.INTEGER, allowNull: true }, { transaction: t });

      // Backfill from the session label's leading year (e.g. "2026-2027" -> 2026).
      const backfill = (table, fkCol) =>
        queryInterface.sequelize.query(
          `UPDATE ${table} SET admission_year = (
             SELECT CAST(SUBSTR(academic_sessions.label, 1, 4) AS INTEGER)
             FROM academic_sessions WHERE academic_sessions.id = ${table}.${fkCol}
           )`,
          { transaction: t }
        );
      await backfill('student_profiles', 'academic_session_id');
      await backfill('program_offerings', 'academic_session_id');
      await backfill('subject_offerings', 'academic_session_id');
      await backfill('semester_certificates', 'academic_session_id');
      // The cohort being promoted is `from_session_id` — that's the value
      // that becomes admission_year (see promotionService.js's existing
      // "session never changes" design). `to_session_id` (which real-world
      // year the promotion ran in) is dropped — PromotionBatch.executedAt
      // already records that precisely.
      await backfill('promotion_batches', 'from_session_id');

      // Any row whose FK was somehow already null falls back to the
      // current year so nothing is left unset.
      const currentYear = new Date().getFullYear();
      for (const table of [...TABLES, 'promotion_batches']) {
        await queryInterface.sequelize.query(
          `UPDATE ${table} SET admission_year = ${currentYear} WHERE admission_year IS NULL`,
          { transaction: t }
        );
      }

      // Old unique indexes referenced the FK column directly — drop before
      // removing that column below. (removeIndex is safe — confirmed.)
      await queryInterface.removeIndex('program_offerings', ['program_id', 'semester_number', 'academic_session_id'], { transaction: t });
      await queryInterface.removeIndex('subject_offerings', ['subject_id', 'program_id', 'semester_number', 'specialization_id', 'academic_session_id'], { transaction: t });
      await queryInterface.removeIndex('semester_certificates', ['student_id', 'program_id', 'semester_number', 'academic_session_id'], { transaction: t });

      // Raw DROP COLUMN — see the file-level comment for why not
      // queryInterface.removeColumn.
      await queryInterface.sequelize.query('ALTER TABLE student_profiles DROP COLUMN academic_session_id', { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE program_offerings DROP COLUMN academic_session_id', { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE subject_offerings DROP COLUMN academic_session_id', { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE semester_certificates DROP COLUMN academic_session_id', { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE promotion_batches DROP COLUMN from_session_id', { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE promotion_batches DROP COLUMN to_session_id', { transaction: t });

      // admission_year is left nullable at the DB level on purpose — see
      // the file-level comment. The Sequelize model's `allowNull: false`
      // covers every row the app writes from here on; the backfill above
      // already guarantees every existing row has a real value.

      await queryInterface.addIndex('program_offerings', { unique: true, fields: ['program_id', 'semester_number', 'admission_year'], transaction: t });
      await queryInterface.addIndex('subject_offerings', { unique: true, fields: ['subject_id', 'program_id', 'semester_number', 'specialization_id', 'admission_year'], transaction: t });
      await queryInterface.addIndex('semester_certificates', { unique: true, fields: ['student_id', 'program_id', 'semester_number', 'admission_year'], transaction: t });

      await queryInterface.dropTable('academic_sessions', { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    // Best-effort reversal: reconstructs one academic_sessions row per
    // distinct admission_year found across the affected tables (label
    // "<year>-<year+1>", with placeholder Aug 1 -> May 31 dates, since the
    // original session dates aren't recoverable once the table was
    // dropped), then re-links each table's FK by matching admission_year.
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'academic_sessions',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
          label: { type: Sequelize.STRING, allowNull: false, unique: true },
          start_date: { type: Sequelize.DATEONLY, allowNull: false },
          end_date: { type: Sequelize.DATEONLY, allowNull: false },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      const [years] = await queryInterface.sequelize.query(
        `SELECT DISTINCT admission_year AS y FROM (
           SELECT admission_year FROM student_profiles
           UNION SELECT admission_year FROM program_offerings
           UNION SELECT admission_year FROM subject_offerings
           UNION SELECT admission_year FROM semester_certificates
           UNION SELECT admission_year FROM promotion_batches
         )`,
        { transaction: t }
      );

      const now = new Date();
      for (const { y } of years) {
        await queryInterface.sequelize.query(
          `INSERT INTO academic_sessions (id, label, start_date, end_date, is_active, created_at, updated_at)
           VALUES (lower(hex(randomblob(16))), '${y}-${y + 1}', '${y}-08-01', '${y + 1}-05-31', 1, '${now.toISOString()}', '${now.toISOString()}')`,
          { transaction: t }
        );
      }

      for (const table of TABLES) {
        await queryInterface.addColumn(table, 'academic_session_id', { type: Sequelize.UUID, allowNull: true }, { transaction: t });
        await queryInterface.sequelize.query(
          `UPDATE ${table} SET academic_session_id = (
             SELECT id FROM academic_sessions WHERE label = ${table}.admission_year || '-' || (${table}.admission_year + 1)
           )`,
          { transaction: t }
        );
      }

      // The up() migration's admission_year-based unique indexes still
      // reference that column — SQLite's native DROP COLUMN refuses to
      // drop a column that's part of an index, so these need to go first.
      await queryInterface.removeIndex('program_offerings', ['program_id', 'semester_number', 'admission_year'], { transaction: t });
      await queryInterface.removeIndex('subject_offerings', ['subject_id', 'program_id', 'semester_number', 'specialization_id', 'admission_year'], { transaction: t });
      await queryInterface.removeIndex('semester_certificates', ['student_id', 'program_id', 'semester_number', 'admission_year'], { transaction: t });

      for (const table of TABLES) {
        // Raw DROP COLUMN again — same reasoning as up().
        await queryInterface.sequelize.query(`ALTER TABLE ${table} DROP COLUMN admission_year`, { transaction: t });
      }

      await queryInterface.addColumn('promotion_batches', 'from_session_id', { type: Sequelize.UUID, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('promotion_batches', 'to_session_id', { type: Sequelize.UUID, allowNull: true }, { transaction: t });
      await queryInterface.sequelize.query(
        `UPDATE promotion_batches SET
           from_session_id = (SELECT id FROM academic_sessions WHERE label = promotion_batches.admission_year || '-' || (promotion_batches.admission_year + 1)),
           to_session_id = (SELECT id FROM academic_sessions WHERE label = promotion_batches.admission_year || '-' || (promotion_batches.admission_year + 1))`,
        { transaction: t }
      );
      await queryInterface.sequelize.query('ALTER TABLE promotion_batches DROP COLUMN admission_year', { transaction: t });

      await queryInterface.addIndex('program_offerings', { unique: true, fields: ['program_id', 'semester_number', 'academic_session_id'], transaction: t });
      await queryInterface.addIndex('subject_offerings', { unique: true, fields: ['subject_id', 'program_id', 'semester_number', 'specialization_id', 'academic_session_id'], transaction: t });
      await queryInterface.addIndex('semester_certificates', { unique: true, fields: ['student_id', 'program_id', 'semester_number', 'academic_session_id'], transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
