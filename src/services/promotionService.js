// Promotion engine: preview -> commit, never a direct irreversible bulk
// update. For every ACTIVE student in the given program+fromSemester+
// admissionYear: advance to fromSemester+1, or GRADUATE if fromSemester
// was the program's last semester. See architecture report §7.5.
//
// IMPORTANT: `admissionYear` on StudentProfile is the student's fixed
// admission cohort, not "which year is it right now" — it never changes
// after promotion, ever. This is what lets a 2026-admitted fresh Sem-1
// student (new AI-coded credit curriculum) and a 2023-admitted student now
// in Sem 7 (still on the old VA-coded non-credit curriculum) coexist
// correctly: each keeps its own SubjectOffering lookups scoped to its own
// admissionYear, even though both are attending classes in the same
// real-world calendar year. There's no separate "which year did this
// promotion run in" field — PromotionBatch.executedAt already records
// that precisely, so admissionYear here always means the cohort.
const { StudentProfile, Program, PromotionBatch, PromotionRecord, User } = require("../models");

async function previewPromotion({ programId, fromSemesterNumber, admissionYear }) {
  const program = await Program.findByPk(programId);
  const students = await StudentProfile.findAll({
    where: { programId, currentSemesterNumber: fromSemesterNumber, admissionYear, status: "ACTIVE" },
    include: [User],
  });

  const toSemesterNumber = fromSemesterNumber + 1;
  const willGraduate = toSemesterNumber > program.totalSemesters;

  return {
    program,
    fromSemesterNumber,
    admissionYear,
    toSemesterNumber: willGraduate ? null : toSemesterNumber,
    willGraduate,
    students, // caller lets the admin exclude specific students (held back) before commit
  };
}

async function commitPromotion({ programId, fromSemesterNumber, admissionYear, studentIds, executedById }) {
  const { sequelize } = require("../models");
  return sequelize.transaction(async (t) => {
    const program = await Program.findByPk(programId, { transaction: t });
    const toSemesterNumber = fromSemesterNumber + 1;
    const willGraduate = toSemesterNumber > program.totalSemesters;

    const batch = await PromotionBatch.create(
      { programId, admissionYear, executedById, status: "COMMITTED" },
      { transaction: t }
    );

    // Scoped by admissionYear too (not just id/program/semester) so a
    // promotion run can never accidentally pull in a same-numbered student
    // from a different cohort.
    const students = await StudentProfile.findAll({
      where: { id: studentIds, programId, currentSemesterNumber: fromSemesterNumber, admissionYear, status: "ACTIVE" },
      transaction: t,
    });

    let promotedCount = 0;
    let graduatedCount = 0;

    for (const student of students) {
      if (willGraduate) {
        student.status = "GRADUATED";
        await student.save({ transaction: t });
        await PromotionRecord.create(
          { promotionBatchId: batch.id, studentId: student.id, fromSemester: fromSemesterNumber, toSemester: null, result: "GRADUATED" },
          { transaction: t }
        );
        graduatedCount++;
      } else {
        student.currentSemesterNumber = toSemesterNumber;
        // admissionYear intentionally left unchanged — see note above.
        student.currentSectionId = null; // admin re-assigns section for the new term
        await student.save({ transaction: t });
        await PromotionRecord.create(
          { promotionBatchId: batch.id, studentId: student.id, fromSemester: fromSemesterNumber, toSemester: toSemesterNumber, result: "PROMOTED" },
          { transaction: t }
        );
        promotedCount++;
      }
    }

    return { batch, promotedCount, graduatedCount };
  });
}

module.exports = { previewPromotion, commitPromotion };
