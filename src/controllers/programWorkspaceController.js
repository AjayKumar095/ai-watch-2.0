// The consolidated School -> Program -> Semester -> Sections/Subjects/
// Mappings workflow. Replaces the previously-disconnected "Program
// Offerings" / "Subject Offerings" / "Sections" top-level tabs with one
// hub page per program, scoped by (Academic Session, Semester Number).
//
// Tab/session/semester state lives entirely in the URL query string
// (?tab=...&session=...&semester=...), so reloading the page preserves
// exactly where you were — no client-side state needed.
const {
  Program,
  School,
  Specialization,
  AcademicSession,
  ProgramOffering,
  Section,
  SubjectPool,
  SubjectOffering,
  TeacherSubjectMapping,
  TeacherProfile,
  User,
  AuditLog,
} = require("../models");
const { safeDestroy } = require("../utils/deleteHelpers");
const { createMapping } = require("../services/teacherMappingService");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const PROGRAMS = { label: "Programs", url: "/admin/programs" };

async function loadWorkspaceData(program, tab, sessionId, semesterNumber) {
  const data = { tab, sessionId, semesterNumber };

  if (tab === "specializations") {
    data.specializations = await Specialization.findAll({ where: { programId: program.id }, order: [["name", "ASC"]] });
  }

  if (tab === "structure") {
    data.sessions = await AcademicSession.findAll({ where: { isActive: true }, order: [["label", "DESC"]] });
    if (!sessionId && data.sessions.length) sessionId = data.sessions[0].id;
    data.sessionId = sessionId;
    data.semesterNumber = semesterNumber || 1;

    if (sessionId) {
      data.offering = await ProgramOffering.findOne({ where: { programId: program.id, semesterNumber: data.semesterNumber, academicSessionId: sessionId } });

      if (data.offering) {
        data.topSections = await Section.findAll({
          where: { programOfferingId: data.offering.id, parentSectionId: null },
          include: [{ model: Section, as: "subGroups" }],
          order: [["name", "ASC"]],
        });

        data.subjectOfferings = await SubjectOffering.findAll({
          where: { programId: program.id, semesterNumber: data.semesterNumber, academicSessionId: sessionId },
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
  const workspace = await loadWorkspaceData(program, tab, req.query.session, req.query.semester ? parseInt(req.query.semester, 10) : null);

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

// --- Structure tab: ensure a ProgramOffering exists for session+semester ---
exports.ensureOffering = async (req, res) => {
  const program = await Program.findByPk(req.params.id);
  if (!program) return res.redirect("/admin/programs");
  const { sessionId, semesterNumber } = req.body;
  await ProgramOffering.findOrCreate({
    where: { programId: program.id, semesterNumber: parseInt(semesterNumber, 10), academicSessionId: sessionId },
    defaults: {},
  });
  res.redirect(`/admin/programs/${program.id}?tab=structure&session=${sessionId}&semester=${semesterNumber}`);
};

// --- Sections & sub-groups, scoped to the current offering ---
exports.createSection = async (req, res) => {
  const { programOfferingId, name, kind, parentSectionId, capacity, sessionId, semesterNumber } = req.body;
  await Section.findOrCreate({
    where: { programOfferingId, parentSectionId: kind === "GROUP" ? parentSectionId : null, name },
    defaults: { kind: kind === "GROUP" ? "GROUP" : "SECTION", capacity: capacity ? parseInt(capacity, 10) : null },
  });
  res.redirect(`/admin/programs/${req.params.id}?tab=structure&session=${sessionId}&semester=${semesterNumber}`);
};

exports.deleteSection = async (req, res) => {
  const { sessionId, semesterNumber } = req.body;
  const section = await Section.findByPk(req.params.sectionId);
  const redirectTo = `/admin/programs/${req.params.id}?tab=structure&session=${sessionId}&semester=${semesterNumber}`;
  if (!section) return res.redirect(redirectTo);
  // safeDestroy sends its own (409) response when blocked — only redirect
  // on the success path, never based on a racy headersSent check against
  // an async render() call.
  if (await safeDestroy(section, res, redirectTo, "section")) res.redirect(redirectTo);
};

// --- Subject offerings, scoped to the current program+semester+session ---
exports.createSubjectOffering = async (req, res) => {
  const { subjectId, specializationId, sessionId, semesterNumber } = req.body;
  await SubjectOffering.findOrCreate({
    where: {
      subjectId,
      programId: req.params.id,
      semesterNumber: parseInt(semesterNumber, 10),
      specializationId: specializationId || null,
      academicSessionId: sessionId,
    },
    defaults: {},
  });
  res.redirect(`/admin/programs/${req.params.id}?tab=structure&session=${sessionId}&semester=${semesterNumber}`);
};

exports.deleteSubjectOffering = async (req, res) => {
  const { sessionId, semesterNumber } = req.body;
  const offering = await SubjectOffering.findByPk(req.params.subjectOfferingId);
  const redirectTo = `/admin/programs/${req.params.id}?tab=structure&session=${sessionId}&semester=${semesterNumber}`;
  if (!offering) return res.redirect(redirectTo);
  if (await safeDestroy(offering, res, redirectTo, "subject offering")) res.redirect(redirectTo);
};

// --- Teacher mappings, scoped to a subject offering within the workspace ---
exports.createMapping = async (req, res) => {
  const { teacherId, sectionId, sessionId, semesterNumber } = req.body;
  const redirectTo = `/admin/programs/${req.params.id}?tab=structure&session=${sessionId}&semester=${semesterNumber}`;
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
  const { sessionId, semesterNumber } = req.body;
  const mapping = await TeacherSubjectMapping.findByPk(req.params.mappingId);
  const redirectTo = `/admin/programs/${req.params.id}?tab=structure&session=${sessionId}&semester=${semesterNumber}`;
  if (mapping) await mapping.destroy();
  res.redirect(redirectTo);
};
