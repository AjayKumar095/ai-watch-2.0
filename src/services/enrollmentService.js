const { Op } = require("sequelize");
const { StudentProfile, SubjectOffering, SubjectEnrollment, Section } = require("../models");
const logger = require("../utils/logger");

/**
 * Automatically enrolls a student into all active SubjectOfferings matching
 * their program, semester, admission year, and specialization (if any).
 * Requires the student to have an assigned currentSectionId.
 *
 * @param {string|StudentProfile} studentOrId - StudentProfile instance or its UUID
 * @returns {Promise<{ enrolledCount: number, totalOfferings: number }>}
 */
async function enrollStudentInOfferings(studentOrId) {
  let student = studentOrId;
  if (typeof studentOrId === "string") {
    student = await StudentProfile.findByPk(studentOrId);
  }

  if (!student || !student.programId || !student.currentSectionId) {
    logger.debug("enrollStudentInOfferings skipped: missing programId or currentSectionId", {
      studentId: student ? student.id : studentOrId,
    });
    return { enrolledCount: 0, totalOfferings: 0 };
  }

  const offerings = await SubjectOffering.findAll({
    where: {
      programId: student.programId,
      semesterNumber: student.currentSemesterNumber,
      admissionYear: student.admissionYear,
      isActive: true,
      [Op.or]: [
        { specializationId: null },
        ...(student.specializationId ? [{ specializationId: student.specializationId }] : []),
      ],
    },
  });

  let enrolledCount = 0;
  for (const offering of offerings) {
    const [enrollment, created] = await SubjectEnrollment.findOrCreate({
      where: {
        subjectOfferingId: offering.id,
        studentId: student.id,
      },
      defaults: {
        sectionId: student.currentSectionId,
      },
    });

    // If enrollment existed but section was missing or outdated, sync section
    if (!created && enrollment.sectionId !== student.currentSectionId) {
      enrollment.sectionId = student.currentSectionId;
      await enrollment.save();
    }

    if (created) enrolledCount++;
  }

  logger.info("Enrolled student in offerings", {
    studentId: student.id,
    enrolledCount,
    totalOfferings: offerings.length,
  });

  return { enrolledCount, totalOfferings: offerings.length };
}

/**
 * Enrolls all eligible, verified students who have a section into the given offering.
 * Used for admin manual enroll or when a new subject offering is created.
 *
 * @param {string} subjectOfferingId
 * @returns {Promise<{ created: number, skipped: number, total: number }>}
 */
async function autoEnrollOffering(subjectOfferingId) {
  const offering = await SubjectOffering.findByPk(subjectOfferingId);
  if (!offering) return { created: 0, skipped: 0, total: 0 };

  const matchingStudents = await StudentProfile.findAll({
    where: {
      programId: offering.programId,
      currentSemesterNumber: offering.semesterNumber,
      admissionYear: offering.admissionYear,
      isVerified: true,
      currentSectionId: { [Op.ne]: null },
      ...(offering.specializationId ? { specializationId: offering.specializationId } : {}),
    },
  });

  let created = 0;
  let skipped = 0;

  for (const student of matchingStudents) {
    const [, wasCreated] = await SubjectEnrollment.findOrCreate({
      where: { subjectOfferingId: offering.id, studentId: student.id },
      defaults: { sectionId: student.currentSectionId },
    });
    if (wasCreated) created++;
    else skipped++;
  }

  return { created, skipped, total: matchingStudents.length };
}

module.exports = {
  enrollStudentInOfferings,
  autoEnrollOffering,
};
