const { AcademicSession, AuditLog } = require("../models");

exports.list = async (req, res) => {
  const sessions = await AcademicSession.findAll({ order: [["startDate", "DESC"]] });
  res.render("admin/sessions/index", { title: "Academic Sessions", sessions });
};

exports.showCreate = (req, res) => {
  res.render("admin/sessions/new", { title: "Add Academic Session", error: null, formData: {} });
};

exports.create = async (req, res) => {
  const { label, startDate, endDate } = req.body;
  const rerender = (error) => res.status(400).render("admin/sessions/new", { title: "Add Academic Session", error, formData: req.body });

  if (!label || !startDate || !endDate) return rerender("All fields are required.");
  const existing = await AcademicSession.findOne({ where: { label } });
  if (existing) return rerender("A session with this label already exists.");

  const session = await AcademicSession.create({ label, startDate, endDate, isActive: true });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_SESSION", entityType: "AcademicSession", entityId: session.id, metadata: { label } });
  res.redirect("/admin/sessions");
};
