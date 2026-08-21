const { School } = require("../models");
const { AuditLog } = require("../models");

exports.list = async (req, res) => {
  const schools = await School.findAll({ order: [["name", "ASC"]] });
  res.render("admin/schools/index", { title: "Schools", schools });
};

exports.showCreate = (req, res) => {
  res.render("admin/schools/new", { title: "Add School", error: null, formData: {} });
};

exports.create = async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) {
    return res.status(400).render("admin/schools/new", { title: "Add School", error: "Name and code are required.", formData: req.body });
  }
  const existing = await School.findOne({ where: { code } });
  if (existing) {
    return res.status(400).render("admin/schools/new", { title: "Add School", error: "A school with this code already exists.", formData: req.body });
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
