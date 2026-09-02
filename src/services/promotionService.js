// Promotion engine: preview -> commit, never a direct irreversible bulk
// update. For every ACTIVE student in the given program+fromSemester+
// fromSession: advance to fromSemester+1, or GRADUATE if fromSemester was
// the program's last semester. See architecture report §7.5.
//
// IMPORTANT: `academicSessionId` on StudentProfile is the student's fixed
// admission cohort, not "which year is it right now" — it never changes
// after promotion. This is what lets a 2026-27 fresh admit (Sem 1, new
// AI-coded credit curriculum) and a 2023-24 admit now in Sem 7 (still on
// the old VA-coded non-credit curriculum) coexist correctly: each keeps
// its own SubjectOffering lookups scoped to its own cohort session, even
// though both are attending classes in the same real-world calendar year.
// `toSessionId` below is kept only as a record of which real-world session
// this promotion event was run in (shown in the batch history) — it is
// deliberately NOT written onto the student.
const { StudentProfile, Program, PromotionBatch, PromotionRecord, User } = require("../models");

async function previewPromotion({ programId, fromSemesterNumber, fromSessionId }) {
  const program = await Program.findByPk(programId);
  const students = await StudentProfile.findAll({
    where: { programId, currentSemesterNumber: fromSemesterNumber, academicSessionId: fromSessionId, status: "ACTIVE" },
    include: [User],
  });

  const toSemesterNumber = fromSemesterNumber + 1;
  const willGraduate = toSemesterNumber > program.totalSemesters;

  return {
    program,
    fromSemesterNumber,
    toSemesterNumber: willGraduate ? null : toSemesterNumber,
    willGraduate,
    students, // caller lets the admin exclude specific students (held back) before commit
  };
}

async function commitPromotion({ programId, fromSemesterNumber, fromSessionId, toSessionId, studentIds, executedById }) {
  const { sequelize } = require("../models");
  return sequelize.transaction(async (t) => {
    const program = await Program.findByPk(programId, { transaction: t });
    const toSemesterNumber = fromSemesterNumber + 1;
    const willGraduate = toSemesterNumber > program.totalSemesters;

    const batch = await PromotionBatch.create(
      { programId, fromSessionId, toSessionId, executedById, status: "COMMITTED" },
      { transaction: t }
    );

    // Scoped by academicSessionId too (not just id/program/semester) so a
    // promotion run can never accidentally pull in a same-numbered student
    // from a different cohort session.
    const students = await StudentProfile.findAll({
      where: { id: studentIds, programId, currentSemesterNumber: fromSemesterNumber, academicSessionId: fromSessionId, status: "ACTIVE" },
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
        // academicSessionId intentionally left unchanged — see note above.
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
