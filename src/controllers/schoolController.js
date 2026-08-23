const { School } = require("../models");
const { AuditLog } = require("../models");
const { safeDestroy } = require("../utils/deleteHelpers");

const CRUMB_ROOT = [{ label: "Dashboard", url: "/admin/dashboard" }, { label: "Schools", url: "/admin/schools" }];

exports.list = async (req, res) => {
  const schools = await School.findAll({ order: [["name", "ASC"]] });
  res.render("admin/schools/index", { title: "Schools", schools, breadcrumbs: [CRUMB_ROOT[0], { label: "Schools" }] });
};

exports.showCreate = (req, res) => {
  res.render("admin/schools/new", { title: "Add School", error: null, formData: {}, breadcrumbs: [...CRUMB_ROOT, { label: "Add School" }] });
};

exports.create = async (req, res) => {
  const { name, code } = req.body;
  const breadcrumbs = [...CRUMB_ROOT, { label: "Add School" }];
  if (!name || !code) {
    return res.status(400).render("admin/schools/new", { title: "Add School", error: "Name and code are required.", formData: req.body, breadcrumbs });
  }
  const existing = await School.findOne({ where: { code } });
  if (existing) {
    return res.status(400).render("admin/schools/new", { title: "Add School", error: "A school with this code already exists.", formData: req.body, breadcrumbs });
  }
  const school = await School.create({ name, code, isActive: true });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_SCHOOL", entityType: "School", entityId: school.id, metadata: { name, code } });
  res.redirect("/admin/schools");
};

exports.toggleActive = async (req, res) => {
  const school = await School.findByPk(req.params.id);
  if (school) {
    school.isActive = !school.isActive;
    await school.save();
  }
  res.redirect("/admin/schools");
};

exports.showEdit = async (req, res) => {
  const school = await School.findByPk(req.params.id);
  if (!school) return res.redirect("/admin/schools");
  res.render("admin/schools/edit", { title: "Edit School", school, error: null, breadcrumbs: [...CRUMB_ROOT, { label: school.name }] });
};

exports.edit = async (req, res) => {
  const school = await School.findByPk(req.params.id);
  if (!school) return res.redirect("/admin/schools");
  const { name, code } = req.body;
  const breadcrumbs = [...CRUMB_ROOT, { label: school.name }];
  if (!name || !code) {
    return res.status(400).render("admin/schools/edit", { title: "Edit School", school, error: "Name and code are required.", breadcrumbs });
  }
  const existing = await School.findOne({ where: { code } });
  if (existing && existing.id !== school.id) {
    return res.status(400).render("admin/schools/edit", { title: "Edit School", school, error: "Another school already uses this code.", breadcrumbs });
  }
  school.name = name;
  school.code = code;
  await school.save();
  await AuditLog.create({ userId: req.currentUser.id, action: "UPDATE_SCHOOL", entityType: "School", entityId: school.id, metadata: { name, code } });
  res.redirect("/admin/schools");
};

exports.delete = async (req, res) => {
  const school = await School.findByPk(req.params.id);
  if (!school) return res.redirect("/admin/schools");
  if (await safeDestroy(school, res, "/admin/schools", "school")) {
    await AuditLog.create({ userId: req.currentUser.id, action: "DELETE_SCHOOL", entityType: "School", entityId: req.params.id, metadata: {} });
    res.redirect("/admin/schools");
  }
};
