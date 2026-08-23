const { Program, School, Specialization, AuditLog } = require("../models");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const PROGRAMS = { label: "Programs", url: "/admin/programs" };

exports.list = async (req, res) => {
  const programs = await Program.findAll({ include: [School, Specialization], order: [["name", "ASC"]] });
  res.render("admin/programs/index", { title: "Programs", programs, breadcrumbs: [ROOT, { label: "Programs" }] });
};

exports.showCreate = async (req, res) => {
  const schools = await School.findAll({ where: { isActive: true } });
  res.render("admin/programs/new", { title: "Add Program", schools, error: null, formData: {}, breadcrumbs: [ROOT, PROGRAMS, { label: "Add Program" }] });
};

exports.create = async (req, res) => {
  const { name, code, schoolId, totalSemesters, durationYears } = req.body;
  const schools = await School.findAll({ where: { isActive: true } });
  const breadcrumbs = [ROOT, PROGRAMS, { label: "Add Program" }];
  const rerender = (error) => res.status(400).render("admin/programs/new", { title: "Add Program", schools, error, formData: req.body, breadcrumbs });

  if (!name || !code || !schoolId || !totalSemesters) return rerender("All fields are required.");
  const existing = await Program.findOne({ where: { code } });
  if (existing) return rerender("A program with this code already exists.");

  const program = await Program.create({
    name, code, schoolId,
    totalSemesters: parseInt(totalSemesters, 10),
    durationYears: durationYears ? parseInt(durationYears, 10) : null,
    isActive: true,
  });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_PROGRAM", entityType: "Program", entityId: program.id, metadata: { name, code } });
  res.redirect("/admin/programs");
};

// --- Specializations (nested under a program) ---

exports.showCreateSpecialization = async (req, res) => {
  const program = await Program.findByPk(req.params.programId);
  if (!program) return res.redirect("/admin/programs");
  res.render("admin/programs/new-specialization", {
    title: "Add Specialization", program, error: null, formData: {},
    breadcrumbs: [ROOT, PROGRAMS, { label: program.name }, { label: "Add Specialization" }],
  });
};

exports.createSpecialization = async (req, res) => {
  const program = await Program.findByPk(req.params.programId);
  if (!program) return res.redirect("/admin/programs");
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).render("admin/programs/new-specialization", {
      title: "Add Specialization", program, error: "Name is required.", formData: req.body,
      breadcrumbs: [ROOT, PROGRAMS, { label: program.name }, { label: "Add Specialization" }],
    });
  }
  await Specialization.create({ programId: program.id, name, description: description || null, isActive: true });
  res.redirect("/admin/programs");
};
