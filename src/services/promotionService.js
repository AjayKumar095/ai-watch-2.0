// Promotion engine: preview -> commit, never a direct irreversible bulk
// update. For every ACTIVE student in the given program+fromSemester+
// fromSession: promote to fromSemester+1 in toSession, or GRADUATE if
// fromSemester was the program's last semester. See architecture report §7.5.
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

    const students = await StudentProfile.findAll({
      where: { id: studentIds, programId, currentSemesterNumber: fromSemesterNumber, status: "ACTIVE" },
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
        student.academicSessionId = toSessionId;
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
