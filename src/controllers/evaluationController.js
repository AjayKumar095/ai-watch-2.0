const {
  Assessment,
  Submission,
  StudentProfile,
  User,
  Section,
  SubjectOffering,
  SubjectPool,
} = require("../models");
const renderBlocks = require("../utils/renderBlocks");

const ROOT = { label: "Dashboard", url: "/teacher/dashboard" };
const ASSESSMENTS = { label: "Assessments", url: "/teacher/assessments" };

// Both evaluateOne and bulkEvaluate read "remarks" straight from req.body,
// which body-parsers turn into an ARRAY the moment a form posts more than
// one field named "remarks" (e.g. a stray duplicate hidden input, or a
// per-row remarks field that isn't uniquely named in submissions.ejs).
// Submission.remarks is a plain string column, so Sequelize's validator
// then rejects the whole update with "remarks cannot be an array or an
// object" — surfacing as a 500 in production. Normalize defensively here
// regardless of what the form sends.
function normalizeRemarks(remarks) {
  if (Array.isArray(remarks)) {
    return remarks.filter((r) => r != null && r !== "").join(" ").trim() || null;
  }
  return remarks || null;
}

// Submissions for one assessment, filterable/groupable by section directly
// (Submission.sectionId is denormalized at submit time for exactly this
// reason — see the schema notes: "which student came from which class").
exports.showSubmissions = async (req, res) => {
  const assessment = await Assessment.findOne({
    where: { id: req.params.id, createdById: req.currentUser.id },
    include: [{ model: SubjectOffering, include: [SubjectPool] }],
  });
  if (!assessment) return res.redirect("/teacher/assessments");

  const where = { assessmentId: assessment.id };
  if (req.query.sectionId) where.sectionId = req.query.sectionId;

  const submissions = await Submission.findAll({
    where,
    include: [{ model: StudentProfile, include: [User] }, Section],
    order: [["sectionId", "ASC"], ["submittedAt", "ASC"]],
  });

  const sections = await Section.findAll({
    include: [{ model: Submission, where: { assessmentId: assessment.id }, required: true, attributes: [] }],
  });
  // de-dup sections (join above can repeat rows)
  const sectionMap = {};
  sections.forEach((s) => (sectionMap[s.id] = s));

  res.render("teacher/assessments/submissions", {
    title: "Submissions",
    assessment,
    descriptionHtml: Array.isArray(assessment.description) ? renderBlocks(assessment.description) : "",
    submissions,
    sections: Object.values(sectionMap),
    activeSectionId: req.query.sectionId || null,
    breadcrumbs: [ROOT, ASSESSMENTS, { label: assessment.title }],
  });
};

exports.evaluateOne = async (req, res) => {
  const submission = await Submission.findByPk(req.params.submissionId, { include: [Assessment] });
  if (!submission || submission.Assessment.createdById !== req.currentUser.id) return res.redirect("/teacher/assessments");

  const rawMarks = (req.body.marksObtained || "").toString().trim();
  const remarks = normalizeRemarks(req.body.remarks);
  const hasMark = rawMarks !== "";
  const hasRemarks = remarks !== null;

  if (!hasMark && !hasRemarks) {
    // Nothing entered on this row — nothing to do.
    return res.redirect(`/teacher/assessments/${submission.assessmentId}/submissions`);
  }

  if (hasMark) {
    const marks = parseFloat(rawMarks);
    if (isNaN(marks) || marks < 0 || marks > parseFloat(submission.Assessment.maxMarks)) {
      return res.redirect(`/teacher/assessments/${submission.assessmentId}/submissions?error=invalid_marks`);
    }
    submission.marksObtained = marks;
  } else {
    // Remarks-only: mark 0, evaluated. A student seeing "0 — file
    // formatting isn't correct" reads as "fix this and resubmit," which
    // is exactly the point — a remark on its own is still feedback the
    // student needs to see and act on, not a pending state.
    submission.marksObtained = 0;
  }
  submission.status = "EVALUATED";

  if (hasRemarks) submission.remarks = remarks;
  submission.evaluatedById = req.currentUser.id;
  await submission.save();

  res.redirect(`/teacher/assessments/${submission.assessmentId}/submissions`);
};

// Bulk evaluate — marks and/or remarks, applied uniformly to every checked
// submission. Previously required a valid mark unconditionally; now either
// field alone is enough, matching evaluateOne's flexibility.
exports.bulkEvaluate = async (req, res) => {
  const assessment = await Assessment.findOne({ where: { id: req.params.id, createdById: req.currentUser.id } });
  if (!assessment) return res.redirect("/teacher/assessments");

  let submissionIds = req.body.submissionIds || [];
  if (!Array.isArray(submissionIds)) submissionIds = [submissionIds];

  const rawMarks = (req.body.marksObtained || "").toString().trim();
  const remarks = normalizeRemarks(req.body.remarks);
  const hasMark = rawMarks !== "";
  const hasRemarks = remarks !== null;

  if (!submissionIds.length || (!hasMark && !hasRemarks)) {
    return res.redirect(`/teacher/assessments/${assessment.id}/submissions?error=invalid_bulk`);
  }

  if (hasMark) {
    const marks = parseFloat(rawMarks);
    if (isNaN(marks) || marks < 0 || marks > parseFloat(assessment.maxMarks)) {
      return res.redirect(`/teacher/assessments/${assessment.id}/submissions?error=invalid_bulk`);
    }

    const payload = { marksObtained: marks, status: "EVALUATED", evaluatedById: req.currentUser.id };
    if (hasRemarks) payload.remarks = remarks;
    await Submission.update(payload, { where: { id: submissionIds, assessmentId: assessment.id } });
  } else {
    // Remarks-only bulk: mark 0, evaluated — same rule as evaluateOne,
    // applied uniformly, so this is a single UPDATE too.
    await Submission.update(
      { marksObtained: 0, status: "EVALUATED", remarks, evaluatedById: req.currentUser.id },
      { where: { id: submissionIds, assessmentId: assessment.id } }
    );
  }

  res.redirect(`/teacher/assessments/${assessment.id}/submissions`);
};

// Save All — scans every row the teacher has open on the page (regardless
// of checkbox selection, which is bulk-evaluate's concern, not this one),
// saves any row where EITHER field is non-empty, and silently skips rows
// where both are empty. Invalid marks (out of range) are skipped and
// reported rather than failing the whole batch, so one typo doesn't lose
// everything else the teacher just filled in.
exports.saveAll = async (req, res) => {
  const assessment = await Assessment.findOne({ where: { id: req.params.id, createdById: req.currentUser.id } });
  if (!assessment) return res.status(404).json({ error: "Assessment not found." });

  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const maxMarks = parseFloat(assessment.maxMarks);

  let saved = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    const rawMarks = (row.marksObtained || "").toString().trim();
    const remarks = normalizeRemarks(row.remarks);
    const hasMark = rawMarks !== "";
    const hasRemarks = remarks !== null;

    if (!hasMark && !hasRemarks) {
      skipped++;
      continue;
    }

    const submission = await Submission.findOne({ where: { id: row.submissionId, assessmentId: assessment.id } });
    if (!submission) {
      skipped++;
      continue;
    }

    if (hasMark) {
      const marks = parseFloat(rawMarks);
      if (isNaN(marks) || marks < 0 || marks > maxMarks) {
        errors.push({ submissionId: row.submissionId, reason: `Marks must be between 0 and ${maxMarks}` });
        continue;
      }
      submission.marksObtained = marks;
    } else {
      // Remarks-only: mark 0, evaluated — same rule as evaluateOne/bulkEvaluate.
      submission.marksObtained = 0;
    }
    submission.status = "EVALUATED";

    if (hasRemarks) submission.remarks = remarks;
    submission.evaluatedById = req.currentUser.id;
    await submission.save();
    saved++;
  }

  res.json({ saved, skipped, errors });
};
