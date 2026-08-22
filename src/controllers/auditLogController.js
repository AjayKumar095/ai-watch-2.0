const { AuditLog, User } = require("../models");

exports.list = async (req, res) => {
  const where = {};
  if (req.query.action) where.action = req.query.action;
  if (req.query.entityType) where.entityType = req.query.entityType;

  const logs = await AuditLog.findAll({
    where,
    include: [User],
    order: [["createdAt", "DESC"]],
    limit: 200,
  });

  const distinctActions = await AuditLog.aggregate("action", "DISTINCT", { plain: false });
  const actions = distinctActions.map((r) => r.DISTINCT).sort();

  res.render("admin/audit-log/index", {
    title: "Audit Log",
    logs,
    actions,
    activeAction: req.query.action || null,
    breadcrumbs: [{ label: "Dashboard", url: "/admin/dashboard" }, { label: "Audit Log" }],
  });
};
