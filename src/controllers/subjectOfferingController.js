const { SubjectOffering, SubjectPool, Program, Specialization, AcademicSession, AuditLog } = require("../models");
const { safeDestroy, tryDestroy } = require("../utils/deleteHelpers");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const OFFERINGS = { label: "Subject Offerings", url: "/admin/subject-offerings" };

exports.list = async (req, res) => {
  const offerings = await SubjectOffering.findAll({
    include: [SubjectPool, Program, Specialization, AcademicSession],
    order: [["semesterNumber", "ASC"]],
  });
  res.render("admin/subject-offerings/index", { title: "Subject Offerings", offerings, bulkMessage: null, breadcrumbs: [ROOT, { label: "Subject Offerings" }] });
};

exports.showCreate = async (req, res) => {
  const [subjects, programs, sessions, specializations] = await Promise.all([
    SubjectPool.findAll({ where: { isActive: true } }),
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
    Specialization.findAll({ include: [Program] }),
  ]);
  res.render("admin/subject-offerings/new", { title: "Add Subject Offering", subjects, programs, sessions, specializations, error: null, formData: {}, breadcrumbs: [ROOT, OFFERINGS, { label: "Add Offering" }] });
};

exports.create = async (req, res) => {
  const { subjectId, programId, semesterNumber, specializationId, academicSessionId } = req.body;
  const [subjects, programs, sessions, specializations] = await Promise.all([
    SubjectPool.findAll({ where: { isActive: true } }),
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
    Specialization.findAll({ include: [Program] }),
  ]);
  const breadcrumbs = [ROOT, OFFERINGS, { label: "Add Offering" }];
  const rerender = (error) =>
    res.status(400).render("admin/subject-offerings/new", { title: "Add Subject Offering", subjects, programs, sessions, specializations, error, formData: req.body, breadcrumbs });

  if (!subjectId || !programId || !semesterNumber || !academicSessionId) return rerender("Subject, program, semester, and session are required.");

  const existing = await SubjectOffering.findOne({
    where: { subjectId, programId, semesterNumber, specializationId: specializationId || null, academicSessionId },
  });
  if (existing) return rerender("This exact subject offering already exists.");

  const offering = await SubjectOffering.create({
    subjectId,
    programId,
    semesterNumber: parseInt(semesterNumber, 10),
    specializationId: specializationId || null,
    academicSessionId,
  });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_SUBJECT_OFFERING", entityType: "SubjectOffering", entityId: offering.id, metadata: {} });
  res.redirect("/admin/subject-offerings");
};

// "Bulk attach subject to programs" — one subject, many program targets at
// once (this is what makes offering "AI for All" across BAC/BA/BBA/LLB one
// action instead of four). See architecture report §7.2.
exports.showBulkAttach = async (req, res) => {
  const [subjects, programs, sessions] = await Promise.all([
    SubjectPool.findAll({ where: { isActive: true } }),
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  res.render("admin/subject-offerings/bulk-attach", { title: "Bulk Attach Subject to Programs", subjects, programs, sessions, result: null, error: null, breadcrumbs: [ROOT, OFFERINGS, { label: "Bulk Attach" }] });
};

exports.bulkAttach = async (req, res) => {
  const { subjectId, academicSessionId } = req.body;
  let programIds = req.body.programIds || [];
  if (!Array.isArray(programIds)) programIds = [programIds];

  const [subjects, programs, sessions] = await Promise.all([
    SubjectPool.findAll({ where: { isActive: true } }),
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);

  if (!subjectId || !academicSessionId || !programIds.length) {
    return res.status(400).render("admin/subject-offerings/bulk-attach", {
      title: "Bulk Attach Subject to Programs", subjects, programs, sessions, result: null,
      error: "Subject, session, and at least one program are required.",
      breadcrumbs: [ROOT, OFFERINGS, { label: "Bulk Attach" }],
    });
  }

  // Each selected program gets its OWN semester number field
  // (semesterFor_<programId>) — this is what makes "HTML in BCA Sem 2 AND
  // BTECH Sem 1, in one action" actually possible, instead of forcing the
  // same semester across every selected program.
  const created = [];
  const skipped = [];
  const invalid = [];
  for (const programId of programIds) {
    const semesterRaw = req.body[`semesterFor_${programId}`];
    const semesterNumber = parseInt(semesterRaw, 10);
    const program = programs.find((p) => p.id === programId);
    if (!semesterRaw || isNaN(semesterNumber) || semesterNumber < 1 || (program && semesterNumber > program.totalSemesters)) {
      invalid.push(program ? program.name : programId);
      continue;
    }
    const [offering, wasCreated] = await SubjectOffering.findOrCreate({
      where: { subjectId, programId, semesterNumber, specializationId: null, academicSessionId },
      defaults: {},
    });
    if (wasCreated) created.push(offering);
    else skipped.push(offering);
  }

  await AuditLog.create({
    userId: req.currentUser.id,
    action: "BULK_ATTACH_SUBJECT",
    entityType: "SubjectPool",
    entityId: subjectId,
    metadata: { createdCount: created.length, skippedCount: skipped.length, invalidCount: invalid.length, programIds },
  });

  res.render("admin/subject-offerings/bulk-attach", {
    title: "Bulk Attach Subject to Programs", subjects, programs, sessions,
    result: { createdCount: created.length, skippedCount: skipped.length, invalid, totalRequested: programIds.length },
    error: null,
    breadcrumbs: [ROOT, OFFERINGS, { label: "Bulk Attach" }],
  });
};

// --- Edit / Delete / Deactivate / Bulk-delete ---
// Only specialization and active-state are editable — the identity fields
// (subject/program/semester/session) are covered by the unique index, so
// "changing" one of those is really "delete and recreate," not an edit.

exports.showEdit = async (req, res) => {
  const offering = await SubjectOffering.findByPk(req.params.id, { include: [SubjectPool, Program, AcademicSession] });
  if (!offering) return res.redirect("/admin/subject-offerings");
  const specializations = await Specialization.findAll({ where: { programId: offering.programId } });
  res.render("admin/subject-offerings/edit", {
    title: "Edit Subject Offering", offering, specializations, error: null,
    breadcrumbs: [ROOT, OFFERINGS, { label: `${offering.SubjectPool.name} — ${offering.Program.name}` }],
  });
};

exports.edit = async (req, res) => {
  const offering = await SubjectOffering.findByPk(req.params.id);
  if (!offering) return res.redirect("/admin/subject-offerings");
  const { specializationId, isActive } = req.body;
  offering.specializationId = specializationId || null;
  offering.isActive = isActive === "on";
  await offering.save();
  await AuditLog.create({ userId: req.currentUser.id, action: "UPDATE_SUBJECT_OFFERING", entityType: "SubjectOffering", entityId: offering.id, metadata: {} });
  res.redirect("/admin/subject-offerings");
};

exports.toggleActive = async (req, res) => {
  const offering = await SubjectOffering.findByPk(req.params.id);
  if (offering) {
    offering.isActive = !offering.isActive;
    await offering.save();
    await AuditLog.create({
      userId: req.currentUser.id,
      action: offering.isActive ? "ACTIVATE_SUBJECT_OFFERING" : "DEACTIVATE_SUBJECT_OFFERING",
      entityType: "SubjectOffering", entityId: offering.id, metadata: {},
    });
  }
  res.redirect("/admin/subject-offerings");
};

exports.delete = async (req, res) => {
  const offering = await SubjectOffering.findByPk(req.params.id, { include: [SubjectPool, Program] });
  if (!offering) return res.redirect("/admin/subject-offerings");
  if (
    await safeDestroy(
      offering, res, "/admin/subject-offerings",
      `subject offering (${offering.SubjectPool.name} — ${offering.Program.name})`
    )
  ) {
    await AuditLog.create({ userId: req.currentUser.id, action: "DELETE_SUBJECT_OFFERING", entityType: "SubjectOffering", entityId: req.params.id, metadata: {} });
    res.redirect("/admin/subject-offerings");
  }
};

// Bulk delete — tryDestroy never touches `res`, so a mixed batch (some
// deletable, some blocked by real assessments/enrollments) can't crash the
// server the way a synchronous headersSent check on a render() would.
exports.bulkDelete = async (req, res) => {
  let ids = req.body.offeringIds || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.filter(Boolean);
  if (!ids.length) return res.redirect("/admin/subject-offerings");

  const offerings = await SubjectOffering.findAll({ where: { id: ids }, include: [SubjectPool, Program] });
  let deletedCount = 0;
  const blocked = [];
  for (const offering of offerings) {
    const result = await tryDestroy(offering);
    if (result.ok) {
      deletedCount++;
      await AuditLog.create({ userId: req.currentUser.id, action: "DELETE_SUBJECT_OFFERING", entityType: "SubjectOffering", entityId: offering.id, metadata: { bulk: true } });
    } else {
      blocked.push(`${offering.SubjectPool.name} (${offering.Program.name})`);
    }
  }

  const offeringsAfter = await SubjectOffering.findAll({ include: [SubjectPool, Program, Specialization, AcademicSession], order: [["semesterNumber", "ASC"]] });
  let message = null;
  if (blocked.length) {
    message = `${deletedCount} deleted. ${blocked.length} skipped because still in use (has assessments or enrolled students): ${blocked.join(", ")}. Deactivate those instead.`;
  }
  res.render("admin/subject-offerings/index", {
    title: "Subject Offerings", offerings: offeringsAfter, bulkMessage: message,
    breadcrumbs: [ROOT, { label: "Subject Offerings" }],
  });
};
