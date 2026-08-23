const { AcademicSession, AuditLog } = require("../models");
const { safeDestroy } = require("../utils/deleteHelpers");

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

exports.showEdit = async (req, res) => {
  const session = await AcademicSession.findByPk(req.params.id);
  if (!session) return res.redirect("/admin/sessions");
  res.render("admin/sessions/edit", { title: "Edit Academic Session", session, error: null, breadcrumbs: [ROOT, SESSIONS, { label: session.label }] });
};

exports.edit = async (req, res) => {
  const session = await AcademicSession.findByPk(req.params.id);
  if (!session) return res.redirect("/admin/sessions");
  const { label, startDate, endDate } = req.body;
  const breadcrumbs = [ROOT, SESSIONS, { label: session.label }];
  if (!label || !startDate || !endDate) {
    return res.status(400).render("admin/sessions/edit", { title: "Edit Academic Session", session, error: "All fields are required.", breadcrumbs });
  }
  const existing = await AcademicSession.findOne({ where: { label } });
  if (existing && existing.id !== session.id) {
    return res.status(400).render("admin/sessions/edit", { title: "Edit Academic Session", session, error: "Another session already uses this label.", breadcrumbs });
  }
  session.label = label;
  session.startDate = startDate;
  session.endDate = endDate;
  await session.save();
  await AuditLog.create({ userId: req.currentUser.id, action: "UPDATE_SESSION", entityType: "AcademicSession", entityId: session.id, metadata: {} });
  res.redirect("/admin/sessions");
};

exports.toggleActive = async (req, res) => {
  const session = await AcademicSession.findByPk(req.params.id);
  if (session) {
    session.isActive = !session.isActive;
    await session.save();
  }
  res.redirect("/admin/sessions");
};

exports.delete = async (req, res) => {
  const session = await AcademicSession.findByPk(req.params.id);
  if (!session) return res.redirect("/admin/sessions");
  if (await safeDestroy(session, res, "/admin/sessions", "academic session")) {
    await AuditLog.create({ userId: req.currentUser.id, action: "DELETE_SESSION", entityType: "AcademicSession", entityId: req.params.id, metadata: {} });
    res.redirect("/admin/sessions");
  }
};
