// const { Op } = require("sequelize");
// const { TeacherSubjectMapping, TeacherProfile, User } = require("../models");

// Enforces the teacher-subject-section conflict rule at the application
// layer (see schema notes: Sequelize/Postgres partial-unique-index caveat).
// Throws a MAPPING_CONFLICT error carrying the conflicting teacher's
// details so the caller can show a clear flag instead of a generic error.
// async function createMapping({ teacherId, subjectOfferingId, sectionId }) {
//   const { sequelize } = require("../models");
//   return sequelize.transaction(async (t) => {
//     const whereConflict = sectionId
//       ? { subjectOfferingId, [Op.or]: [{ sectionId }, { sectionId: null }] }
//       : { subjectOfferingId }; // requesting ALL sections conflicts with any existing mapping on this offering

//     const existing = await TeacherSubjectMapping.findOne({
//       where: whereConflict,
//       include: [{ model: TeacherProfile, include: [User] }],
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });

//     if (existing && existing.teacherId !== teacherId) {
//       const err = new Error("MAPPING_CONFLICT");
//       err.code = "MAPPING_CONFLICT";
//       err.conflict = {
//         teacherName: `${existing.TeacherProfile.User.firstName} ${existing.TeacherProfile.User.lastName}`,
//         teacherEmail: existing.TeacherProfile.User.email,
//         sectionId: existing.sectionId,
//       };
//       throw err;
//     }

//     if (existing && existing.teacherId === teacherId) {
//       return existing; // already mapped, idempotent
//     }

//     return TeacherSubjectMapping.create({ teacherId, subjectOfferingId, sectionId: sectionId || null }, { transaction: t });
//   });
// }

// module.exports = { createMapping };

const { Op } = require("sequelize");

const {
  sequelize,
  TeacherSubjectMapping,
  TeacherSubjectMappingSpecialization,
  TeacherProfile,
  User,
  SubjectOffering,
  Section,
  Specialization,
} = require("../models");

async function createMapping({
  teacherId,
  subjectOfferingId,
  sectionId = null,
  specializationIds = [],
}) {
  return sequelize.transaction(async (t) => {
    // ---------------------------------------------------------
    // 1. Validate subject offering
    // ---------------------------------------------------------

    const offering = await SubjectOffering.findByPk(
      subjectOfferingId,
      {
        transaction: t,
      }
    );

    if (!offering) {
      const err = new Error("Subject offering not found.");
      err.code = "SUBJECT_OFFERING_NOT_FOUND";
      throw err;
    }

    // ---------------------------------------------------------
    // 2. Validate teacher
    // ---------------------------------------------------------

    const teacher = await TeacherProfile.findByPk(teacherId, {
      include: [User],
      transaction: t,
    });

    if (!teacher) {
      const err = new Error("Teacher not found.");
      err.code = "TEACHER_NOT_FOUND";
      throw err;
    }

    // ---------------------------------------------------------
    // 3. Normalize specialization IDs
    //
    // Empty array = ALL specializations
    // ---------------------------------------------------------

    const normalizedSpecializationIds = [
      ...new Set(
        (Array.isArray(specializationIds)
          ? specializationIds
          : specializationIds
            ? [specializationIds]
            : []
        ).filter(Boolean)
      ),
    ];

    // ---------------------------------------------------------
    // 4. Validate section
    //
    // null section = ALL sections
    // ---------------------------------------------------------

    if (sectionId) {
      const selectedSection = await Section.findByPk(sectionId, {
        // include: [
        //   {
        //     association: "parentSection",
        //   },
        //   {
        //     association: "ProgramOffering",
        //   },
        // ],
        transaction: t,
      });

      if (!selectedSection) {
        const err = new Error("Section not found.");
        err.code = "SECTION_NOT_FOUND";
        throw err;
      }


      const programOffering =
        await selectedSection.getProgramOffering({
          transaction: t,
        });

      if (
        !programOffering ||
        programOffering.programId !== offering.programId ||
        programOffering.semesterNumber !==
        offering.semesterNumber ||
        programOffering.admissionYear !== offering.admissionYear
      ) {
        const err = new Error(
          "Selected section does not belong to this subject offering."
        );

        err.code = "INVALID_SECTION_FOR_OFFERING";

        throw err;
      }
    }

    // ---------------------------------------------------------
    // 5. Validate specializations
    //
    // They must belong to the same program as the offering.
    //
    // Empty array = ALL specializations
    // ---------------------------------------------------------

    if (normalizedSpecializationIds.length > 0) {
      const specializations = await Specialization.findAll({
        where: {
          id: {
            [Op.in]: normalizedSpecializationIds,
          },
          programId: offering.programId,
        },
        transaction: t,
      });

      if (
        specializations.length !==
        normalizedSpecializationIds.length
      ) {
        const err = new Error(
          "One or more selected specializations do not belong to this program."
        );

        err.code = "INVALID_SPECIALIZATION_FOR_OFFERING";

        throw err;
      }
    }

    // ---------------------------------------------------------
    // 6. Load existing mappings for this subject offering
    // ---------------------------------------------------------

    const existingMappings =
      await TeacherSubjectMapping.findAll({
        where: {
          subjectOfferingId,
        },

        include: [
          {
            model: TeacherProfile,
            include: [User],
          },
          {
            model: TeacherSubjectMappingSpecialization,
            as: "mappingSpecializations",
          },
        ],

        transaction: t,

        lock: t.LOCK.UPDATE,
      });

    // ---------------------------------------------------------
    // 7. Check conflicts
    // ---------------------------------------------------------

    for (const existing of existingMappings) {
      // Same teacher is not a conflict.
      if (existing.teacherId === teacherId) {
        continue;
      }

      // -------------------------------------------------------
      // Section overlap
      //
      // null = ALL sections
      // -------------------------------------------------------

      const sectionsOverlap =
        !sectionId ||
        !existing.sectionId ||
        existing.sectionId === sectionId;

      if (!sectionsOverlap) {
        continue;
      }

      // -------------------------------------------------------
      // Specialization overlap
      //
      // zero specialization rows = ALL specializations
      // -------------------------------------------------------

      const existingSpecializationIds = (
        existing.mappingSpecializations || []
      ).map((item) => item.specializationId);

      const existingIsAllSpecializations =
        existingSpecializationIds.length === 0;

      const requestedIsAllSpecializations =
        normalizedSpecializationIds.length === 0;

      let specializationsOverlap = false;

      if (
        existingIsAllSpecializations ||
        requestedIsAllSpecializations
      ) {
        specializationsOverlap = true;
      } else {
        specializationsOverlap =
          normalizedSpecializationIds.some((id) =>
            existingSpecializationIds.includes(id)
          );
      }

      if (!specializationsOverlap) {
        continue;
      }

      // -------------------------------------------------------
      // Conflict found
      // -------------------------------------------------------

      const conflictTeacher =
        existing.TeacherProfile;

      const conflictUser =
        conflictTeacher?.User;

      const err = new Error("MAPPING_CONFLICT");

      err.code = "MAPPING_CONFLICT";

      err.conflict = {
        teacherName: conflictUser
          ? `${conflictUser.firstName} ${conflictUser.lastName}`
          : "Unknown teacher",

        teacherEmail:
          conflictUser?.email || "",

        sectionId:
          existing.sectionId,

        specializationIds:
          existingSpecializationIds,

        allSections:
          !existing.sectionId,

        allSpecializations:
          existingIsAllSpecializations,
      };

      throw err;
    }

    // ---------------------------------------------------------
    // 8. Check exact duplicate for same teacher
    // ---------------------------------------------------------

    const sameTeacherMappings =
      existingMappings.filter(
        (mapping) =>
          mapping.teacherId === teacherId
      );

    for (const existing of sameTeacherMappings) {
      const existingSpecializationIds = (
        existing.mappingSpecializations || []
      ).map((item) => item.specializationId);

      const existingSorted =
        [...existingSpecializationIds].sort();

      const requestedSorted =
        [...normalizedSpecializationIds].sort();

      const sameSection =
        (existing.sectionId || null) ===
        (sectionId || null);

      const sameSpecializations =
        existingSorted.length ===
        requestedSorted.length &&
        existingSorted.every(
          (id, index) =>
            id === requestedSorted[index]
        );

      if (
        sameSection &&
        sameSpecializations
      ) {
        return existing;
      }
    }

    // ---------------------------------------------------------
    // 9. Create mapping
    // ---------------------------------------------------------

    const mapping =
      await TeacherSubjectMapping.create(
        {
          teacherId,
          subjectOfferingId,
          sectionId: sectionId || null,
        },
        {
          transaction: t,
        }
      );

    // ---------------------------------------------------------
    // 10. Create specialization rows
    //
    // ZERO rows = ALL specializations
    // ---------------------------------------------------------

    if (
      normalizedSpecializationIds.length > 0
    ) {
      await TeacherSubjectMappingSpecialization.bulkCreate(
        normalizedSpecializationIds.map(
          (specializationId) => ({
            mappingId: mapping.id,
            specializationId,
          })
        ),
        {
          transaction: t,
        }
      );
    }

    return mapping;
  });
}

module.exports = {
  createMapping,
};
