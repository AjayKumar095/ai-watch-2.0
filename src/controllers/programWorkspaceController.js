// The consolidated School -> Program -> Semester -> Sections/Subjects/
// Mappings workflow. Replaces the previously-disconnected "Program
// Offerings" / "Subject Offerings" / "Sections" top-level tabs with one
// hub page per program, scoped by (Admission Year, Semester Number).
//
// Tab/year/semester state lives entirely in the URL query string
// (?tab=...&year=...&semester=...), so reloading the page preserves
// exactly where you were — no client-side state needed.
const {
  Program,
  School,
  Specialization,
  ProgramOffering,
  Section,
  SubjectPool,
  SubjectOffering,
  TeacherSubjectMapping,
  TeacherProfile,
  User,
  StudentProfile,
  SubjectEnrollment,
  Assessment,
  AuditLog,
} = require("../models");
const { safeDestroy } = require("../utils/deleteHelpers");
const { createMapping } = require("../services/teacherMappingService");
const { distinctAdmissionYears } = require("../services/admissionYearService");
const logger = require("../utils/logger");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const PROGRAMS = { label: "Programs", url: "/admin/programs" };

async function loadWorkspaceData(program, tab, year, semesterNumber) {
  const data = { tab, year, semesterNumber };

  if (tab === "specializations") {
    data.specializations = await Specialization.findAll({ where: { programId: program.id }, order: [["name", "ASC"]] });
  }

  if (tab === "structure") {
    data.years = await distinctAdmissionYears();
    if (!year && data.years.length) year = data.years[0];
    data.year = year;
    data.semesterNumber = semesterNumber || 1;

    if (year) {
      data.offering = await ProgramOffering.findOne({ where: { programId: program.id, semesterNumber: data.semesterNumber, admissionYear: year } });

      if (data.offering) {
        data.topSections = await Section.findAll({
          where: { programOfferingId: data.offering.id, parentSectionId: null },
          include: [{ model: Section, as: "subGroups" }],
          order: [["name", "ASC"]],
        });

        data.subjectOfferings = await SubjectOffering.findAll({
          where: { programId: program.id, semesterNumber: data.semesterNumber, admissionYear: year },
          include: [
            SubjectPool,
            Specialization,
            { model: TeacherSubjectMapping, include: [{ model: TeacherProfile, include: [User] }, Section] },
          ],
        });

        data.allSubjects = await SubjectPool.findAll({ where: { isActive: true }, order: [["name", "ASC"]] });
        data.specializations = await Specialization.findAll({ where: { programId: program.id } });
        data.allTeachers = await TeacherProfile.findAll({ include: [User] });
        // flatten top+sub sections for the mapping-target dropdown
        data.allSectionsFlat = [];
        for (const s of data.topSections) {
          data.allSectionsFlat.push(s);
          for (const g of s.subGroups || []) data.allSectionsFlat.push(g);
        }
      }
    }
  }

  return data;
}

exports.show = async (req, res) => {
  const program = await Program.findByPk(req.params.id, { include: [School] });
  if (!program) return res.redirect("/admin/programs");

  const tab = req.query.tab || "overview";
  const schools = await School.findAll({ where: { isActive: true } });
  const year = req.query.year ? parseInt(req.query.year, 10) : null;
  const workspace = await loadWorkspaceData(program, tab, year, req.query.semester ? parseInt(req.query.semester, 10) : null);

  res.render("admin/programs/workspace", {
    title: program.name,
    program,
    schools,
    workspace,
    error: req.query.error || null,
    breadcrumbs: [ROOT, PROGRAMS, { label: program.name }],
  });
};

// --- Overview tab: edit basic program info ---
exports.updateOverview = async (req, res) => {
  const program = await Program.findByPk(req.params.id);
  if (!program) return res.redirect("/admin/programs");
  const { name, code, schoolId, totalSemesters, durationYears } = req.body;

  if (!name || !code || !schoolId || !totalSemesters) {
    return res.redirect(`/admin/programs/${program.id}?tab=overview&error=` + encodeURIComponent("All fields except duration are required."));
  }
  const existing = await Program.findOne({ where: { code } });
  if (existing && existing.id !== program.id) {
    return res.redirect(`/admin/programs/${program.id}?tab=overview&error=` + encodeURIComponent("Another program already uses this code."));
  }

  program.name = name;
  program.code = code;
  program.schoolId = schoolId;
  program.totalSemesters = parseInt(totalSemesters, 10);
  program.durationYears = durationYears ? parseInt(durationYears, 10) : null;
  await program.save();
  await AuditLog.create({ userId: req.currentUser.id, action: "UPDATE_PROGRAM", entityType: "Program", entityId: program.id, metadata: {} });
  res.redirect(`/admin/programs/${program.id}?tab=overview`);
};

exports.toggleActive = async (req, res) => {
  const program = await Program.findByPk(req.params.id);
  if (program) {
    program.isActive = !program.isActive;
    await program.save();
  }
  res.redirect(`/admin/programs/${req.params.id}?tab=overview`);
};

exports.deleteProgram = async (req, res) => {
  const program = await Program.findByPk(req.params.id);
  if (!program) return res.redirect("/admin/programs");

  // Named and counted up front instead of relying on the generic
  // FK-constraint catch — "still has other records depending on it" told
  // you nothing about WHAT, which made removing a program feel like a
  // guessing game (delete the program -> blocked by a subject offering ->
  // delete that -> blocked by something else -> ...). This isn't actually
  // circular: it's a straight top-down chain (Program -> Subject Offerings
  // -> Enrollments/Assessments), it just wasn't visible before.
  const [specializationCount, offeringCount, subjectOfferingCount, studentCount] = await Promise.all([
    Specialization.count({ where: { programId: program.id } }),
    ProgramOffering.count({ where: { programId: program.id } }),
    SubjectOffering.count({ where: { programId: program.id } }),
    StudentProfile.count({ where: { programId: program.id } }),
  ]);

  const blockers = [];
  if (studentCount > 0) blockers.push(`${studentCount} student(s) enrolled in this program`);
  if (subjectOfferingCount > 0) blockers.push(`${subjectOfferingCount} subject offering(s) — remove these first, from the Structure tab`);
  if (offeringCount > 0) blockers.push(`${offeringCount} semester offering(s) set up (with their sections)`);
  if (specializationCount > 0) blockers.push(`${specializationCount} specialization(s)`);

  if (blockers.length) {
    logger.warn("Blocked delete: program still has dependents", { programId: program.id, blockers });
    return res.status(409).render("error", {
      title: "Can't delete",
      message: `"${program.name}" still has: ${blockers.join("; ")}. Student enrollments and subject offerings must be removed first (they're protected from accidental deletion); semester offerings and specializations would be removed automatically but are listed so you know what's attached.`,
    });
  }

  if (await safeDestroy(program, res, "/admin/programs", "program")) {
    await AuditLog.create({ userId: req.currentUser.id, action: "DELETE_PROGRAM", entityType: "Program", entityId: req.params.id, metadata: {} });
    res.redirect("/admin/programs");
  }
};

// --- Specializations tab ---
exports.createSpecialization = async (req, res) => {
  const program = await Program.findByPk(req.params.id);
  if (!program) return res.redirect("/admin/programs");
  const { name, description } = req.body;
  if (name) {
    await Specialization.create({ programId: program.id, name, description: description || null, isActive: true });
  }
  res.redirect(`/admin/programs/${program.id}?tab=specializations`);
};

exports.updateSpecialization = async (req, res) => {
  const spec = await Specialization.findOne({ where: { id: req.params.specId, programId: req.params.id } });
  if (spec) {
    const { name, description } = req.body;
    if (name) {
      spec.name = name;
      spec.description = description || null;
      await spec.save();
    }
  }
  res.redirect(`/admin/programs/${req.params.id}?tab=specializations`);
};

exports.deleteSpecialization = async (req, res) => {
  const spec = await Specialization.findOne({ where: { id: req.params.specId, programId: req.params.id } });
  const redirectTo = `/admin/programs/${req.params.id}?tab=specializations`;
  if (!spec) return res.redirect(redirectTo);
  if (await safeDestroy(spec, res, redirectTo, "specialization")) res.redirect(redirectTo);
};

// --- Structure tab: ensure a ProgramOffering exists for year+semester ---
exports.ensureOffering = async (req, res) => {
  const program = await Program.findByPk(req.params.id);
  if (!program) return res.redirect("/admin/programs");
  const { year, semesterNumber } = req.body;
  await ProgramOffering.findOrCreate({
    where: { programId: program.id, semesterNumber: parseInt(semesterNumber, 10), admissionYear: parseInt(year, 10) },
    defaults: {},
  });
  res.redirect(`/admin/programs/${program.id}?tab=structure&year=${year}&semester=${semesterNumber}`);
};

// --- Sections & sub-groups, scoped to the current offering ---
exports.createSection = async (req, res) => {
  const { programOfferingId, name, kind, parentSectionId, capacity, year, semesterNumber } = req.body;
  await Section.findOrCreate({
    where: { programOfferingId, parentSectionId: kind === "GROUP" ? parentSectionId : null, name },
    defaults: { kind: kind === "GROUP" ? "GROUP" : "SECTION", capacity: capacity ? parseInt(capacity, 10) : null },
  });
  res.redirect(`/admin/programs/${req.params.id}?tab=structure&year=${year}&semester=${semesterNumber}`);
};

exports.deleteSection = async (req, res) => {
  const { year, semesterNumber } = req.body;
  const section = await Section.findByPk(req.params.sectionId);
  const redirectTo = `/admin/programs/${req.params.id}?tab=structure&year=${year}&semester=${semesterNumber}`;
  if (!section) return res.redirect(redirectTo);
  // safeDestroy sends its own (409) response when blocked — only redirect
  // on the success path, never based on a racy headersSent check against
  // an async render() call.
  if (await safeDestroy(section, res, redirectTo, "section")) res.redirect(redirectTo);
};

// --- Subject offerings, scoped to the current program+semester+year ---
exports.createSubjectOffering = async (req, res) => {
  const { subjectId, specializationId, year, semesterNumber } = req.body;
  await SubjectOffering.findOrCreate({
    where: {
      subjectId,
      programId: req.params.id,
      semesterNumber: parseInt(semesterNumber, 10),
      specializationId: specializationId || null,
      admissionYear: parseInt(year, 10),
    },
    defaults: {},
  });
  res.redirect(`/admin/programs/${req.params.id}?tab=structure&year=${year}&semester=${semesterNumber}`);
};

exports.deleteSubjectOffering = async (req, res) => {
  const { year, semesterNumber } = req.body;
  const offering = await SubjectOffering.findByPk(req.params.subjectOfferingId, { include: [SubjectPool] });
  const redirectTo = `/admin/programs/${req.params.id}?tab=structure&year=${year}&semester=${semesterNumber}`;
  if (!offering) return res.redirect(redirectTo);

  const [enrollmentCount, assessmentCount, mappingCount] = await Promise.all([
    SubjectEnrollment.count({ where: { subjectOfferingId: offering.id } }),
    Assessment.count({ where: { subjectOfferingId: offering.id } }),
    TeacherSubjectMapping.count({ where: { subjectOfferingId: offering.id } }),
  ]);

  if (enrollmentCount > 0 || assessmentCount > 0) {
    const blockers = [];
    if (enrollmentCount > 0) blockers.push(`${enrollmentCount} student enrollment(s)`);
    if (assessmentCount > 0) blockers.push(`${assessmentCount} assessment(s) created under it (with any submissions/grades)`);
    const mappingNote = mappingCount > 0 ? ` Its ${mappingCount} teacher mapping(s) would be removed automatically.` : "";
    logger.warn("Blocked delete: subject offering still has dependents", { subjectOfferingId: offering.id, enrollmentCount, assessmentCount });
    return res.status(409).render("error", {
      title: "Can't delete",
      message: `"${offering.SubjectPool.name}" for this semester still has: ${blockers.join("; ")}. Unenroll the students and remove the assessments first — this is protected because it would otherwise erase submitted work and grades.${mappingNote}`,
    });
  }

  if (await safeDestroy(offering, res, redirectTo, "subject offering")) res.redirect(redirectTo);
};

// --- Teacher mappings, scoped to a subject offering within the workspace ---
exports.createMapping = async (req, res) => {
  const { teacherId, sectionId, year, semesterNumber } = req.body;
  const redirectTo = `/admin/programs/${req.params.id}?tab=structure&year=${year}&semester=${semesterNumber}`;
  try {
    await createMapping({ teacherId, subjectOfferingId: req.params.subjectOfferingId, sectionId: sectionId || null });
    res.redirect(redirectTo);
  } catch (err) {
    if (err.code === "MAPPING_CONFLICT") {
      const msg = `Conflict: already mapped to ${err.conflict.teacherName} (${err.conflict.teacherEmail}).`;
      return res.redirect(redirectTo + "&error=" + encodeURIComponent(msg));
    }
    throw err;
  }
};

exports.deleteMapping = async (req, res) => {
  const { year, semesterNumber } = req.body;
  const mapping = await TeacherSubjectMapping.findByPk(req.params.mappingId);
  const redirectTo = `/admin/programs/${req.params.id}?tab=structure&year=${year}&semester=${semesterNumber}`;
  if (mapping) await mapping.destroy();
  res.redirect(redirectTo);
};
