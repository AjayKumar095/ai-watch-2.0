const { Program, School, Specialization, AuditLog } = require("../models");

exports.list = async (req, res) => {
  const programs = await Program.findAll({ include: [School, Specialization], order: [["name", "ASC"]] });
  res.render("admin/programs/index", { title: "Programs", programs });
};

exports.showCreate = async (req, res) => {
  const schools = await School.findAll({ where: { isActive: true } });
  res.render("admin/programs/new", { title: "Add Program", schools, error: null, formData: {} });
};

exports.create = async (req, res) => {
  const { name, code, schoolId, totalSemesters } = req.body;
  const schools = await School.findAll({ where: { isActive: true } });
  const rerender = (error) => res.status(400).render("admin/programs/new", { title: "Add Program", schools, error, formData: req.body });

  if (!name || !code || !schoolId || !totalSemesters) return rerender("All fields are required.");
  const existing = await Program.findOne({ where: { code } });
  if (existing) return rerender("A program with this code already exists.");

  const program = await Program.create({ name, code, schoolId, totalSemesters: parseInt(totalSemesters, 10), isActive: true });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_PROGRAM", entityType: "Program", entityId: program.id, metadata: { name, code } });
  res.redirect("/admin/programs");
};

// --- Specializations (nested under a program) ---

exports.showCreateSpecialization = async (req, res) => {
  const program = await Program.findByPk(req.params.programId);
  if (!program) return res.redirect("/admin/programs");
  res.render("admin/programs/new-specialization", { title: "Add Specialization", program, error: null, formData: {} });
};

exports.createSpecialization = async (req, res) => {
  const program = await Program.findByPk(req.params.programId);
  if (!program) return res.redirect("/admin/programs");
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).render("admin/programs/new-specialization", { title: "Add Specialization", program, error: "Name is required.", formData: req.body });
  }
  await Specialization.create({ programId: program.id, name, description: description || null, isActive: true });
  res.redirect("/admin/programs");
};
