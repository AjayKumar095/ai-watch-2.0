const { AcademicSession, AuditLog } = require("../models");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const SESSIONS = { label: "Academic Sessions", url: "/admin/sessions" };

exports.list = async (req, res) => {
  const sessions = await AcademicSession.findAll({ order: [["startDate", "DESC"]] });
  res.render("admin/sessions/index", { title: "Academic Sessions", sessions, breadcrumbs: [ROOT, { label: "Academic Sessions" }] });
};

exports.showCreate = (req, res) => {
  res.render("admin/sessions/new", { title: "Add Academic Session", error: null, formData: {}, breadcrumbs: [ROOT, SESSIONS, { label: "Add Session" }] });
};

exports.create = async (req, res) => {
  const { label, startDate, endDate } = req.body;
  const breadcrumbs = [ROOT, SESSIONS, { label: "Add Session" }];
  const rerender = (error) => res.status(400).render("admin/sessions/new", { title: "Add Academic Session", error, formData: req.body, breadcrumbs });

  if (!label || !startDate || !endDate) return rerender("All fields are required.");
  const existing = await AcademicSession.findOne({ where: { label } });
  if (existing) return rerender("A session with this label already exists.");

  const session = await AcademicSession.create({ label, startDate, endDate, isActive: true });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_SESSION", entityType: "AcademicSession", entityId: session.id, metadata: { label } });
  res.redirect("/admin/sessions");
};
