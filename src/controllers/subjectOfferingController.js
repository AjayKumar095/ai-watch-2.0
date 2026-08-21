const { SubjectOffering, SubjectPool, Program, Specialization, AcademicSession, AuditLog } = require("../models");

exports.list = async (req, res) => {
  const offerings = await SubjectOffering.findAll({
    include: [SubjectPool, Program, Specialization, AcademicSession],
    order: [["semesterNumber", "ASC"]],
  });
  res.render("admin/subject-offerings/index", { title: "Subject Offerings", offerings });
};

exports.showCreate = async (req, res) => {
  const [subjects, programs, sessions, specializations] = await Promise.all([
    SubjectPool.findAll({ where: { isActive: true } }),
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
    Specialization.findAll({ include: [Program] }),
  ]);
  res.render("admin/subject-offerings/new", { title: "Add Subject Offering", subjects, programs, sessions, specializations, error: null, formData: {} });
};

exports.create = async (req, res) => {
  const { subjectId, programId, semesterNumber, specializationId, academicSessionId } = req.body;
  const [subjects, programs, sessions, specializations] = await Promise.all([
    SubjectPool.findAll({ where: { isActive: true } }),
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
    Specialization.findAll({ include: [Program] }),
  ]);
  const rerender = (error) =>
    res.status(400).render("admin/subject-offerings/new", { title: "Add Subject Offering", subjects, programs, sessions, specializations, error, formData: req.body });

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
  res.render("admin/subject-offerings/bulk-attach", { title: "Bulk Attach Subject to Programs", subjects, programs, sessions, result: null, error: null });
};

exports.bulkAttach = async (req, res) => {
  const { subjectId, semesterNumber, academicSessionId } = req.body;
  let programIds = req.body.programIds || [];
  if (!Array.isArray(programIds)) programIds = [programIds];

  const [subjects, programs, sessions] = await Promise.all([
    SubjectPool.findAll({ where: { isActive: true } }),
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);

  if (!subjectId || !semesterNumber || !academicSessionId || !programIds.length) {
    return res.status(400).render("admin/subject-offerings/bulk-attach", {
      title: "Bulk Attach Subject to Programs", subjects, programs, sessions, result: null,
      error: "Subject, semester, session, and at least one program are required.",
    });
  }

  const created = [];
  const skipped = [];
  for (const programId of programIds) {
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
    metadata: { createdCount: created.length, skippedCount: skipped.length, programIds },
  });

  res.render("admin/subject-offerings/bulk-attach", {
    title: "Bulk Attach Subject to Programs", subjects, programs, sessions,
    result: { createdCount: created.length, skippedCount: skipped.length, totalRequested: programIds.length },
    error: null,
  });
};
