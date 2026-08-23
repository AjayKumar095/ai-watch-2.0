const { Op } = require("sequelize");
const {
  Assessment,
  AssessmentSection,
  AssessmentStudentOverride,
  Section,
  ProgramOffering,
  SubjectOffering,
  SubjectPool,
  Program,
  TeacherSubjectMapping,
  TeacherProfile,
  Submission,
  StudentProfile,
  User,
} = require("../models");

const ROOT = { label: "Dashboard", url: "/teacher/dashboard" };
const ASSESSMENTS = { label: "Assessments", url: "/teacher/assessments" };

async function loadTeacherProfile(req) {
  return TeacherProfile.findOne({ where: { userId: req.currentUser.id } });
}

const { targetableSectionsForMapping } = require("../services/sectionScope");

// Builds the list of "subjectOffering + concrete sections" combos a teacher
// can target. A mapping scoped to a specific top-level Section covers that
// whole class (including its sub-groups) as ONE target; a mapping scoped to
// a specific sub-group is scoped to just that sub-group; an "all sections"
// mapping (sectionId = null) expands to one option per TOP-LEVEL section
// under the offering (each of which still covers its own sub-groups) — see
// src/services/sectionScope.js for the shared hierarchy rule.
async function buildTargetOptions(teacherProfile) {
  const mappings = await TeacherSubjectMapping.findAll({
    where: { teacherId: teacherProfile.id },
    include: [{ model: SubjectOffering, include: [SubjectPool, Program] }, Section],
  });

  const options = [];
  for (const m of mappings) {
    if (m.sectionId) {
      options.push({ subjectOfferingId: m.subjectOfferingId, subjectOffering: m.SubjectOffering, section: m.Section });
    } else {
      const offerings = await ProgramOffering.findAll({
        where: { programId: m.SubjectOffering.programId, semesterNumber: m.SubjectOffering.semesterNumber },
      });
      for (const po of offerings) {
        const topSections = await targetableSectionsForMapping(null, po.id);
        for (const sec of topSections) {
          options.push({ subjectOfferingId: m.subjectOfferingId, subjectOffering: m.SubjectOffering, section: sec });
        }
      }
    }
  }
  return options;
}

exports.list = async (req, res) => {
  const assessments = await Assessment.findAll({
    where: { createdById: req.currentUser.id },
    include: [{ model: SubjectOffering, include: [SubjectPool, Program] }, AssessmentSection],
    order: [["createdAt", "DESC"]],
  });

  const counts = {};
  for (const a of assessments) {
    counts[a.id] = {
      total: await Submission.count({ where: { assessmentId: a.id } }),
      pending: await Submission.count({ where: { assessmentId: a.id, status: "PENDING" } }),
    };
  }

  res.render("teacher/assessments/index", { title: "My Assessments", assessments, counts, breadcrumbs: [ROOT, { label: "Assessments" }] });
};

exports.showCreate = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);
  const targetOptions = await buildTargetOptions(teacherProfile);

  let prefill = {};
  let initialDescription = null;
  if (req.query.duplicateFrom) {
    const source = await Assessment.findOne({ where: { id: req.query.duplicateFrom, createdById: req.currentUser.id } });
    if (source) {
      prefill = { title: source.title + " (Copy)", maxMarks: source.maxMarks, attachmentUrl: source.attachmentUrl };
      initialDescription = source.description || null;
    }
  }

  res.render("teacher/assessments/new", {
    title: "Create Assessment", targetOptions, error: null, formData: prefill,
    // Passed to the client as the BlockNote editor's initialContent — null means "start blank."
    initialDescriptionJson: JSON.stringify(initialDescription),
    breadcrumbs: [ROOT, ASSESSMENTS, { label: "Create Assessment" }],
  });
};

exports.create = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);
  const targetOptions = await buildTargetOptions(teacherProfile);

  const { title, attachmentUrl, startAt, endAt, maxMarks, descriptionBlocks } = req.body;
  let targets = req.body.targets || []; // format: "<subjectOfferingId>:<sectionId>"
  if (!Array.isArray(targets)) targets = [targets];

  const breadcrumbs = [ROOT, ASSESSMENTS, { label: "Create Assessment" }];
  const rerender = (error) =>
    res.status(400).render("teacher/assessments/new", { title: "Create Assessment", targetOptions, error, formData: req.body, breadcrumbs });

  if (!title || !startAt || !endAt || !maxMarks || !targets.length) {
    return rerender("Please fill in all fields and select at least one section to target.");
  }

  // descriptionBlocks arrives as a JSON string from the BlockNote editor's
  // hidden input (editor.document, serialized client-side before submit).
  let description = null;
  if (descriptionBlocks) {
    try {
      description = JSON.parse(descriptionBlocks);
    } catch (e) {
      return rerender("Couldn't read the assessment content — please try again.");
    }
  }

  // Group selected targets by subjectOfferingId — one Assessment row per
  // subject offering, however many sections/programs it spans (this is the
  // "same assessment across multiple global-subject programs at once" fix).
  const grouped = {};
  for (const t of targets) {
    const [subjectOfferingId, sectionId] = t.split(":");
    if (!grouped[subjectOfferingId]) grouped[subjectOfferingId] = [];
    grouped[subjectOfferingId].push(sectionId);
  }

  const created = [];
  for (const [subjectOfferingId, sectionIds] of Object.entries(grouped)) {
    const assessment = await Assessment.create({
      subjectOfferingId,
      createdById: req.currentUser.id,
      title,
      description: description || null,
      attachmentUrl: attachmentUrl || null,
      startAt,
      endAt,
      maxMarks,
      isActive: true,
    });
    for (const sectionId of sectionIds) {
      await AssessmentSection.create({ assessmentId: assessment.id, sectionId });
    }
    created.push(assessment);
  }

  res.redirect("/teacher/assessments");
};

// Called by the BlockNote editor's uploadFile callback (assessmentEditorEntry.jsx).
exports.uploadImage = (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: "No image file received." });
  res.json({ success: true, file: { url: `/uploads/assessment-content/${req.file.filename}` } });
};

// Bulk "open submission for selected students" — reuses
// AssessmentStudentOverride, exposed as a multi-select action.
exports.showOverride = async (req, res) => {
  const assessment = await Assessment.findOne({
    where: { id: req.params.id, createdById: req.currentUser.id },
    include: [{ model: SubjectOffering, include: [SubjectPool] }, { model: AssessmentSection, include: [Section] }],
  });
  if (!assessment) return res.redirect("/teacher/assessments");

  const sectionIds = assessment.AssessmentSections.map((as) => as.sectionId);
  const { SubjectEnrollment } = require("../models");
  const enrollments = await SubjectEnrollment.findAll({
    where: { subjectOfferingId: assessment.subjectOfferingId, sectionId: sectionIds },
    include: [{ model: StudentProfile, include: [User] }],
  });

  res.render("teacher/assessments/override", { title: "Open Submission Window", assessment, enrollments, breadcrumbs: [ROOT, ASSESSMENTS, { label: assessment.title }, { label: "Open Submission Window" }] });
};

exports.applyOverride = async (req, res) => {
  const assessment = await Assessment.findOne({ where: { id: req.params.id, createdById: req.currentUser.id } });
  if (!assessment) return res.redirect("/teacher/assessments");

  let studentIds = req.body.studentIds || [];
  if (!Array.isArray(studentIds)) studentIds = [studentIds];
  const { startAt, endAt } = req.body;

  for (const studentId of studentIds) {
    await AssessmentStudentOverride.upsert({
      assessmentId: assessment.id,
      studentId,
      startAt: startAt || null,
      endAt: endAt || null,
    });
  }

  res.redirect(`/teacher/assessments`);
};
