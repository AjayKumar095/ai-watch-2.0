const { AcademicYear, sequelize } = require("../models");

/**
 * Returns active academic years from the database.
 * If none exist yet, creates sensible defaults.
 */
async function getActiveAcademicYears() {
  const years = await AcademicYear.findAll({
    where: { isActive: true },
    order: [["yearStart", "DESC"]],
  });

  if (years.length > 0) {
    return years;
  }

  // Fallback if table was emptied
  return [
    { label: "2027-2028", admissionYear: 2027, yearStart: 2027, yearEnd: 2028, isCurrent: false },
    { label: "2026-2027", admissionYear: 2026, yearStart: 2026, yearEnd: 2027, isCurrent: true },
    { label: "2025-2026", admissionYear: 2025, yearStart: 2025, yearEnd: 2026, isCurrent: false },
  ];
}

/**
 * Returns all academic years (both active and inactive) for admin management.
 */
async function getAllAcademicYears() {
  return AcademicYear.findAll({
    order: [["yearStart", "DESC"]],
  });
}

/**
 * Returns the default active academic year (the one marked isCurrent, or first active).
 */
async function getDefaultAcademicYear() {
  const current = await AcademicYear.findOne({
    where: { isActive: true, isCurrent: true },
  });
  if (current) return current;

  const firstActive = await AcademicYear.findOne({
    where: { isActive: true },
    order: [["yearStart", "DESC"]],
  });
  return firstActive || null;
}

/**
 * Backwards-compatible helper returning an array of numbers [2028, 2027, 2026, 2025].
 * Used by existing forms and controllers.
 */
async function distinctAdmissionYears() {
  const activeYears = await getActiveAcademicYears();
  if (activeYears && activeYears.length > 0) {
    return activeYears.map((y) => y.admissionYear);
  }

  const [rows] = await sequelize.query(`
    SELECT DISTINCT admission_year AS year FROM (
      SELECT admission_year FROM student_profiles
      UNION SELECT admission_year FROM program_offerings
      UNION SELECT admission_year FROM subject_offerings
    )
    ORDER BY year DESC
  `);
  return rows.map((r) => r.year);
}

module.exports = {
  getActiveAcademicYears,
  getAllAcademicYears,
  getDefaultAcademicYear,
  distinctAdmissionYears,
};
