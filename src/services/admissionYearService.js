// Admission year replaced the old AcademicSession table (see the migration
// comment in migrations/20260904000000-… for why), so there's no longer a
// table to query for "which years exist" — this reconstructs a sensible
// list instead: every year already in use anywhere (so existing cohorts
// and offerings are always selectable), plus a couple of near-future years
// so an admin can set up a brand new admission year's structure before any
// student has signed up under it yet.
const { sequelize } = require("../models");

async function distinctAdmissionYears() {
  const [rows] = await sequelize.query(`
    SELECT DISTINCT admission_year AS year FROM (
      SELECT admission_year FROM student_profiles
      UNION SELECT admission_year FROM program_offerings
      UNION SELECT admission_year FROM subject_offerings
    )
    ORDER BY year DESC
  `);
  const existing = rows.map((r) => r.year);

  const currentYear = new Date().getFullYear();
  const upcoming = [currentYear + 1, currentYear];
  const years = [...new Set([...upcoming, ...existing])].sort((a, b) => b - a);
  return years;
}

module.exports = { distinctAdmissionYears };
