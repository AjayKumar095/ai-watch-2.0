const { Program, AcademicSession } = require("../models");
const { cloneSessionForward } = require("../services/sessionCloneService");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };

exports.showClone = async (req, res) => {
  const [programs, sessions] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  res.render("admin/session-clone/new", {
    title: "Clone Academic Session Forward", programs, sessions, error: null, result: null,
    breadcrumbs: [ROOT, { label: "Clone Session" }],
  });
};

exports.clone = async (req, res) => {
  const { programId, fromSessionId, toSessionId } = req.body;
  const [programs, sessions] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  const breadcrumbs = [ROOT, { label: "Clone Session" }];

  if (!programId || !fromSessionId || !toSessionId) {
    return res.status(400).render("admin/session-clone/new", {
      title: "Clone Academic Session Forward", programs, sessions, breadcrumbs, result: null,
      error: "Program, source session, and target session are all required.",
    });
  }
  if (fromSessionId === toSessionId) {
    return res.status(400).render("admin/session-clone/new", {
      title: "Clone Academic Session Forward", programs, sessions, breadcrumbs, result: null,
      error: "Source and target session must be different.",
    });
  }

  const summary = await cloneSessionForward({ programId, fromSessionId, toSessionId });

  const { AuditLog } = require("../models");
  await AuditLog.create({
    userId: req.currentUser.id, action: "CLONE_SESSION", entityType: "Program", entityId: programId,
    metadata: { fromSessionId, toSessionId, ...summary },
  });

  res.render("admin/session-clone/new", {
    title: "Clone Academic Session Forward", programs, sessions, breadcrumbs, error: null, result: summary,
  });
};
