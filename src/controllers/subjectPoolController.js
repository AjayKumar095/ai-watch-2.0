const { SubjectPool, AuditLog } = require("../models");

exports.list = async (req, res) => {
  const subjects = await SubjectPool.findAll({ order: [["name", "ASC"]] });
  res.render("admin/subjects/index", { title: "Subject Pool", subjects });
};

exports.showCreate = (req, res) => {
  res.render("admin/subjects/new", { title: "Add Subject", error: null, formData: {} });
};

exports.create = async (req, res) => {
  const { name, code, category } = req.body;
  const rerender = (error) => res.status(400).render("admin/subjects/new", { title: "Add Subject", error, formData: req.body });

  if (!name || !code) return rerender("Name and code are required.");
  const existing = await SubjectPool.findOne({ where: { code } });
  if (existing) return rerender("A subject with this code already exists.");

  const subject = await SubjectPool.create({
    name,
    code,
    category: category === "PROGRAM_SPECIFIC" ? "PROGRAM_SPECIFIC" : "UNIVERSITY_WIDE",
    isActive: true,
  });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_SUBJECT", entityType: "SubjectPool", entityId: subject.id, metadata: { name, code } });
  res.redirect("/admin/subjects");
};

// Bulk CSV import — expects a "name,code,category" header row.
// category is optional per row; defaults to UNIVERSITY_WIDE.
exports.showBulkImport = (req, res) => {
  res.render("admin/subjects/bulk-import", { title: "Bulk Import Subjects", result: null, error: null });
};

exports.bulkImport = async (req, res) => {
  const { csvText } = req.body;
  if (!csvText || !csvText.trim()) {
    return res.status(400).render("admin/subjects/bulk-import", { title: "Bulk Import Subjects", result: null, error: "Paste some CSV text first." });
  }

  const lines = csvText.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const dataLines = lines[0].toLowerCase().startsWith("name") ? lines.slice(1) : lines;

  const created = [];
  const skipped = [];
  for (const line of dataLines) {
    const [name, code, category] = line.split(",").map((s) => (s || "").trim());
    if (!name || !code) {
      skipped.push({ line, reason: "missing name or code" });
      continue;
    }
    const existing = await SubjectPool.findOne({ where: { code } });
    if (existing) {
      skipped.push({ line, reason: "code already exists" });
      continue;
    }
    const subject = await SubjectPool.create({
      name,
      code,
      category: category === "PROGRAM_SPECIFIC" ? "PROGRAM_SPECIFIC" : "UNIVERSITY_WIDE",
      isActive: true,
    });
    created.push(subject);
  }

  await AuditLog.create({
    userId: req.currentUser.id,
    action: "BULK_IMPORT_SUBJECTS",
    entityType: "SubjectPool",
    entityId: "bulk",
    metadata: { createdCount: created.length, skippedCount: skipped.length },
  });

  res.render("admin/subjects/bulk-import", {
    title: "Bulk Import Subjects",
    result: { created, skipped },
    error: null,
  });
};
