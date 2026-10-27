// Mark-sheet plugin: builds one class's student x assessment marks table and
// serialises it as CSV. Read-only — never writes to any table.
const {
  TeacherSubjectMapping, TeacherSubjectMappingSpecialization, Specialization, SubjectOffering, SubjectPool, Program,
  Section, SubjectEnrollment, StudentProfile, User, Assessment, AssessmentSection, AssessmentSectionSpecialization, Submission,
} = require("../models");
const { specializationMatches } = require("./sectionScope");

const mappingInclude = () => [
  { model: SubjectOffering, include: [SubjectPool, Program] },
  { model: Section, include: [{ model: Section, as: "parentSection" }] },
  { model: TeacherSubjectMappingSpecialization, as: "mappingSpecializations", include: [{ model: Specialization, as: "Specialization" }] },
];

function sectionLabel(sec) {
  if (!sec) return "All sections";
  return sec.parentSection ? `Section ${sec.parentSection.name} - ${sec.name}` : `Section ${sec.name}`;
}

// One "class" = one of the teacher's own subject mappings.
async function listClasses(teacherProfileId) {
  const mappings = await TeacherSubjectMapping.findAll({ where: { teacherId: teacherProfileId }, include: mappingInclude() });
  return mappings
    .map((m) => {
      const specs = (m.mappingSpecializations || []).map((s) => s.Specialization && s.Specialization.name).filter(Boolean);
      const so = m.SubjectOffering;
      return {
        id: m.id,
        label: `${so.SubjectPool.name} · ${so.Program.name} Sem ${so.semesterNumber} · ${sectionLabel(m.Section)}${specs.length ? " · " + specs.join(", ") : ""}`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

// Returns null when the mapping does not belong to this teacher.
async function buildMarkSheet({ teacherProfileId, teacherUserId, mappingId }) {
  const m = await TeacherSubjectMapping.findOne({ where: { id: mappingId, teacherId: teacherProfileId }, include: mappingInclude() });
  if (!m) return null;

  const specIds = (m.mappingSpecializations || []).map((s) => s.specializationId);

  // Same membership rule as the teacher roster.
  const enrollments = await SubjectEnrollment.findAll({
    where: { subjectOfferingId: m.subjectOfferingId, isActive: true },
    include: [{ model: StudentProfile, include: [User] }, Section],
  });
  const students = enrollments.filter((e) => {
    const secOk = !m.sectionId || e.sectionId === m.sectionId || (e.Section && e.Section.parentSectionId === m.sectionId);
    return secOk && e.StudentProfile && e.StudentProfile.User && specializationMatches(e.StudentProfile.specializationId, specIds);
  });

  // This teacher's own assessments for the subject.
  const assessments = await Assessment.findAll({
    where: { subjectOfferingId: m.subjectOfferingId, createdById: teacherUserId, isActive: true },
    include: [{ model: AssessmentSection, include: [{ model: AssessmentSectionSpecialization, as: "sectionSpecializations" }] }],
    order: [["createdAt", "ASC"]],
  });

  const subs = assessments.length && students.length
    ? await Submission.findAll({
        where: { assessmentId: assessments.map((a) => a.id), studentId: students.map((e) => e.StudentProfile.id) },
        attributes: ["assessmentId", "studentId", "status", "marksObtained"],
      })
    : [];
  const subKey = new Map(subs.map((s) => [`${s.assessmentId}:${s.studentId}`, s]));

  const targeted = (a, e) => {
    const secIds = [e.sectionId, e.Section && e.Section.parentSectionId].filter(Boolean);
    return a.AssessmentSections.some(
      (as) => secIds.includes(as.sectionId) &&
        specializationMatches(e.StudentProfile.specializationId, (as.sectionSpecializations || []).map((x) => x.specializationId))
    );
  };

  const columns = ["student_name", "student_roll", ...assessments.map((a) => `${a.title} (/${parseFloat(a.maxMarks)})`), "Total_marks", "Adjusted_marks"];
  const rows = students
    .map((e) => {
      const sp = e.StudentProfile;
      let total = 0;
      let maxTotal = 0; // sum of max marks of the assessments that apply to THIS student
      const cells = assessments.map((a) => {
        if (!targeted(a, e)) return "N/A";
        maxTotal += parseFloat(a.maxMarks);
        const s = subKey.get(`${a.id}:${sp.id}`);
        if (!s) return "";
        if (s.status !== "EVALUATED" || s.marksObtained == null) return "Pending";
        const v = parseFloat(s.marksObtained);
        total += v;
        return String(v);
      });
      // Adjusted marks: the same percentage, rescaled to 100 (e.g. 120 of 125 -> 96).
      const adjusted = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
      return { studentId: sp.id, name: `${sp.User.firstName} ${sp.User.lastName}`.trim(), roll: sp.rollNo, cells, total, adjusted };
    })
    .sort((a, b) => String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true }));

  const so = m.SubjectOffering;
  return {
    mappingId: m.id,
    subjectOfferingId: m.subjectOfferingId,
    subject: so.SubjectPool.name,
    program: so.Program.name,
    semester: so.semesterNumber,
    sectionLabel: sectionLabel(m.Section),
    assessmentTitles: assessments.map((a) => `${a.title} (/${parseFloat(a.maxMarks)})`),
    title: `${so.SubjectPool.name} · ${so.Program.name} Sem ${so.semesterNumber} · ${sectionLabel(m.Section)}`,
    columns,
    rows,
    records: rows.map((r) => [r.name, r.roll, ...r.cells, String(Math.round(r.total * 100) / 100), String(Math.round(r.adjusted * 100) / 100)]),
  };
}

const r2 = (n) => String(Math.round(n * 100) / 100);

// All of a teacher's classes, or only the given mapping ids. Unknown / foreign ids are skipped.
async function buildSheets({ teacherProfileId, teacherUserId, mappingIds }) {
  const ids = mappingIds || (await TeacherSubjectMapping.findAll({ where: { teacherId: teacherProfileId }, attributes: ["id"] })).map((x) => x.id);
  const sheets = [];
  for (const id of ids) {
    const sh = await buildMarkSheet({ teacherProfileId, teacherUserId, mappingId: id });
    if (sh) sheets.push(sh);
  }
  return sheets.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

// One CSV combining every class. Each distinct assessment ("Title (/max)") gets its own
// column, in first-seen order; a class that doesn't have that assessment gets "N/A".
// (If one class has two assessments with the identical title+max, the repeat is shown as "... #2".)
// A student reachable through two overlapping mappings (e.g. "All sections" + "Section A")
// of the same subject is listed once.
function toMasterCsv(sheets) {
  const colOrder = [];
  const colIndex = new Map();
  const keysFor = sheets.map((sh) => {
    const used = new Map();
    return sh.assessmentTitles.map((t) => {
      const n = (used.get(t) || 0) + 1;
      used.set(t, n);
      const key = n > 1 ? `${t} #${n}` : t;
      if (!colIndex.has(key)) { colIndex.set(key, colOrder.length); colOrder.push(key); }
      return key;
    });
  });
  const head = ["subject", "program", "semester", "section", "student_name", "student_roll", ...colOrder, "Total_marks", "Adjusted_marks"];
  const seen = new Set();
  const out = [head];
  sheets.forEach((sh, si) => {
    const keys = keysFor[si];
    for (const r of sh.rows) {
      const key = `${sh.subjectOfferingId}:${r.studentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cells = Array(colOrder.length).fill("N/A");
      keys.forEach((k, i) => { cells[colIndex.get(k)] = r.cells[i]; });
      out.push([sh.subject, sh.program, sh.semester, sh.sectionLabel, r.name, r.roll, ...cells, r2(r.total), r2(r.adjusted)]);
    }
  });
  return out.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// --- Minimal ZIP writer (store-only, UTF-8 names): avoids adding a dependency. ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function makeZip(files) { // files: [{ name, data: string|Buffer }]
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8"), data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    chunks.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, end]);
}

// RFC-4180 CSV; cells starting with = + - @ are neutralised (spreadsheet formula injection).
function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (sheet) => [sheet.columns, ...sheet.records].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

module.exports = { listClasses, buildMarkSheet, buildSheets, toCsv, toMasterCsv, makeZip };
