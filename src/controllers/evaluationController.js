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

  const { marksObtained } = req.body;
  const remarks = normalizeRemarks(req.body.remarks);
  const marks = parseFloat(marksObtained);
  if (isNaN(marks) || marks < 0 || marks > parseFloat(submission.Assessment.maxMarks)) {
    return res.redirect(`/teacher/assessments/${submission.assessmentId}/submissions?error=invalid_marks`);
  }

  submission.marksObtained = marks;
  submission.remarks = remarks;
  submission.status = "EVALUATED";
  submission.evaluatedById = req.currentUser.id;
  await submission.save();

  res.redirect(`/teacher/assessments/${submission.assessmentId}/submissions`);
};

// Bulk evaluate — uniform marks/remarks across every selected submission ID.
exports.bulkEvaluate = async (req, res) => {
  const assessment = await Assessment.findOne({ where: { id: req.params.id, createdById: req.currentUser.id } });
  if (!assessment) return res.redirect("/teacher/assessments");

  let submissionIds = req.body.submissionIds || [];
  if (!Array.isArray(submissionIds)) submissionIds = [submissionIds];
  const { marksObtained } = req.body;
  const remarks = normalizeRemarks(req.body.remarks);
  const marks = parseFloat(marksObtained);

  if (isNaN(marks) || marks < 0 || marks > parseFloat(assessment.maxMarks) || !submissionIds.length) {
    return res.redirect(`/teacher/assessments/${assessment.id}/submissions?error=invalid_bulk`);
  }

  await Submission.update(
    { marksObtained: marks, remarks, status: "EVALUATED", evaluatedById: req.currentUser.id },
    { where: { id: submissionIds, assessmentId: assessment.id } }
  );

  res.redirect(`/teacher/assessments/${assessment.id}/submissions`);
};
