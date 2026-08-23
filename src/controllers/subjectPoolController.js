const { parse } = require("csv-parse/sync");
const { SubjectPool, AuditLog } = require("../models");
const { safeDestroy } = require("../utils/deleteHelpers");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const SUBJECTS = { label: "Subject Pool", url: "/admin/subjects" };

exports.list = async (req, res) => {
  const subjects = await SubjectPool.findAll({ order: [["name", "ASC"]] });
  res.render("admin/subjects/index", { title: "Subject Pool", subjects, breadcrumbs: [ROOT, { label: "Subject Pool" }] });
};

exports.showCreate = (req, res) => {
  res.render("admin/subjects/new", { title: "Add Subject", error: null, formData: {}, breadcrumbs: [ROOT, SUBJECTS, { label: "Add Subject" }] });
};

exports.create = async (req, res) => {
  const { name, code, category } = req.body;
  const breadcrumbs = [ROOT, SUBJECTS, { label: "Add Subject" }];
  const rerender = (error) => res.status(400).render("admin/subjects/new", { title: "Add Subject", error, formData: req.body, breadcrumbs });

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

exports.showEdit = async (req, res) => {
  const subject = await SubjectPool.findByPk(req.params.id);
  if (!subject) return res.redirect("/admin/subjects");
  res.render("admin/subjects/edit", { title: "Edit Subject", subject, error: null, breadcrumbs: [ROOT, SUBJECTS, { label: subject.name }] });
};

exports.edit = async (req, res) => {
  const subject = await SubjectPool.findByPk(req.params.id);
  if (!subject) return res.redirect("/admin/subjects");
  const { name, code, category } = req.body;
  const breadcrumbs = [ROOT, SUBJECTS, { label: subject.name }];
  if (!name || !code) {
    return res.status(400).render("admin/subjects/edit", { title: "Edit Subject", subject, error: "Name and code are required.", breadcrumbs });
  }
  const existing = await SubjectPool.findOne({ where: { code } });
  if (existing && existing.id !== subject.id) {
    return res.status(400).render("admin/subjects/edit", { title: "Edit Subject", subject, error: "Another subject already uses this code.", breadcrumbs });
  }
  subject.name = name;
  subject.code = code;
  subject.category = category === "PROGRAM_SPECIFIC" ? "PROGRAM_SPECIFIC" : "UNIVERSITY_WIDE";
  await subject.save();
  await AuditLog.create({ userId: req.currentUser.id, action: "UPDATE_SUBJECT", entityType: "SubjectPool", entityId: subject.id, metadata: {} });
  res.redirect("/admin/subjects");
};

exports.delete = async (req, res) => {
  const subject = await SubjectPool.findByPk(req.params.id);
  if (!subject) return res.redirect("/admin/subjects");
  if (await safeDestroy(subject, res, "/admin/subjects", "subject")) {
    await AuditLog.create({ userId: req.currentUser.id, action: "DELETE_SUBJECT", entityType: "SubjectPool", entityId: req.params.id, metadata: {} });
    res.redirect("/admin/subjects");
  }
};

// --- Bulk import: pasted CSV text OR an uploaded .csv file, same underlying
// row processor either way. ---

exports.showBulkImport = (req, res) => {
  res.render("admin/subjects/bulk-import", {
    title: "Bulk Import Subjects", result: null, error: null,
    breadcrumbs: [ROOT, SUBJECTS, { label: "Bulk Import" }],
  });
};

function parseRows(csvContent) {
  // Tolerant parser: works whether the source used csv-parse-friendly
  // quoting or was hand-typed comma-separated text with a header row.
  let records;
  try {
    records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    // Fall back to naive split for hand-pasted text without proper quoting.
    const lines = csvContent.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const dataLines = lines[0] && lines[0].toLowerCase().startsWith("name") ? lines.slice(1) : lines;
    records = dataLines.map((line) => {
      const [name, code, category] = line.split(",").map((s) => (s || "").trim());
      return { name, code, category };
    });
  }
  return records;
}

async function processRows(records, userId) {
  const created = [];
  const skipped = [];
  for (const row of records) {
    const name = (row.name || "").trim();
    const code = (row.code || "").trim();
    const category = (row.category || "").trim().toUpperCase();
    if (!name || !code) {
      skipped.push({ line: JSON.stringify(row), reason: "missing name or code" });
      continue;
    }
    const existing = await SubjectPool.findOne({ where: { code } });
    if (existing) {
      skipped.push({ line: `${name},${code}`, reason: "code already exists" });
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
    userId,
    action: "BULK_IMPORT_SUBJECTS",
    entityType: "SubjectPool",
    entityId: "bulk",
    metadata: { createdCount: created.length, skippedCount: skipped.length },
  });
  return { created, skipped };
}

exports.bulkImport = async (req, res) => {
  const breadcrumbs = [ROOT, SUBJECTS, { label: "Bulk Import" }];
  // req.file comes from multer (file upload); req.body.csvText from the pasted-text form.
  const csvContent = req.file ? req.file.buffer.toString("utf-8") : req.body.csvText;

  if (!csvContent || !csvContent.trim()) {
    return res.status(400).render("admin/subjects/bulk-import", {
      title: "Bulk Import Subjects", result: null,
      error: "Paste CSV text or choose a .csv file to upload.", breadcrumbs,
    });
  }

  let result;
  try {
    const records = parseRows(csvContent);
    result = await processRows(records, req.currentUser.id);
  } catch (err) {
    return res.status(400).render("admin/subjects/bulk-import", {
      title: "Bulk Import Subjects", result: null,
      error: "Couldn't parse that file — check it's a valid CSV with name,code,category columns.", breadcrumbs,
    });
  }

  res.render("admin/subjects/bulk-import", { title: "Bulk Import Subjects", result, error: null, breadcrumbs });
};
