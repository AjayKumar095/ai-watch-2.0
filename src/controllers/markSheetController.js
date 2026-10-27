const { TeacherProfile } = require("../models");
const { listClasses, buildMarkSheet, buildSheets, toCsv, toMasterCsv, makeZip } = require("../services/markSheetService");

async function teacherOf(req) {
  return TeacherProfile.findOne({ where: { userId: req.currentUser.id } });
}

exports.classes = async (req, res) => {
  const tp = await teacherOf(req);
  if (!tp) return res.status(403).json({ error: "Teacher profile not found." });
  res.json({ classes: await listClasses(tp.id) });
};

// Returns CSV (text/csv). ?download=1 makes the browser save it as a file.
exports.csv = async (req, res) => {
  const tp = await teacherOf(req);
  if (!tp) return res.status(403).send("Teacher profile not found.");
  const sheet = await buildMarkSheet({ teacherProfileId: tp.id, teacherUserId: req.currentUser.id, mappingId: String(req.query.classId || "") });
  if (!sheet) return res.status(404).send("Class not found.");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Cache-Control", "no-store");
  res.set("X-Sheet-Title", encodeURIComponent(sheet.title));
  if (req.query.download) {
    const safe = sheet.title.replace(/[^\w\-]+/g, "_").slice(0, 80);
    res.set("Content-Disposition", `attachment; filename="marksheet_${safe}.csv"`);
    return res.send("﻿" + toCsv(sheet)); // BOM so Excel reads UTF-8 names correctly
  }
  res.send(toCsv(sheet));
};

// Full page: /teacher/marksheet (the sidebar link points here).
exports.page = (req, res) => {
  res.render("teacher/marksheet", {
    title: "Mark Sheet",
    breadcrumbs: [{ label: "Dashboard", url: "/teacher/dashboard" }, { label: "Mark Sheet" }],
  });
};

const safeName = (t) => t.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "class";
const stamp = () => new Date().toISOString().slice(0, 10);

// ZIP of one CSV per class. ?classIds=a,b,c  (or ?all=1 for every class the teacher has)
exports.zip = async (req, res) => {
  const tp = await teacherOf(req);
  if (!tp) return res.status(403).send("Teacher profile not found.");
  const mappingIds = req.query.all ? null : String(req.query.classIds || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (mappingIds && !mappingIds.length) return res.status(400).send("Select at least one class.");
  const sheets = await buildSheets({ teacherProfileId: tp.id, teacherUserId: req.currentUser.id, mappingIds });
  if (!sheets.length) return res.status(404).send("No classes found.");
  const used = new Set();
  const files = sheets.map((sh) => {
    let n = safeName(sh.title), i = 2;
    while (used.has(n)) n = `${safeName(sh.title)}_${i++}`;
    used.add(n);
    return { name: `${n}.csv`, data: "\uFEFF" + toCsv(sh) };
  });
  res.set("Content-Type", "application/zip");
  res.set("Cache-Control", "no-store");
  res.set("Content-Disposition", `attachment; filename="marksheets_${stamp()}.zip"`);
  res.send(makeZip(files));
};

// One CSV combining every class (mapping) the teacher has.
exports.master = async (req, res) => {
  const tp = await teacherOf(req);
  if (!tp) return res.status(403).send("Teacher profile not found.");
  const sheets = await buildSheets({ teacherProfileId: tp.id, teacherUserId: req.currentUser.id, mappingIds: null });
  if (!sheets.length) return res.status(404).send("No classes found.");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Cache-Control", "no-store");
  res.set("Content-Disposition", `attachment; filename="master_marksheet_${stamp()}.csv"`);
  res.send("\uFEFF" + toMasterCsv(sheets));
};
