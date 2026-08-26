const { SubjectOffering, SubjectPool, Program, Specialization, AcademicSession, AuditLog } = require("../models");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const OFFERINGS = { label: "Subject Offerings", url: "/admin/subject-offerings" };

exports.list = async (req, res) => {
  const offerings = await SubjectOffering.findAll({
    include: [SubjectPool, Program, Specialization, AcademicSession],
    order: [["semesterNumber", "ASC"]],
  });
  res.render("admin/subject-offerings/index", { title: "Subject Offerings", offerings, breadcrumbs: [ROOT, { label: "Subject Offerings" }] });
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
