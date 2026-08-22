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

// Builds the list of "subjectOffering + concrete sections" combos a teacher
// can target, expanding an all-sections mapping (sectionId = null) into
// every section under that offering's ProgramOffering. This is what powers
// the "select exactly the sections you teach" picker (fixes "2 of 3
// sections" and the old duplicate-assessment-per-section problem).
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
      // all-sections mapping — expand to every section under the matching ProgramOffering
      const offerings = await ProgramOffering.findAll({
        where: { programId: m.SubjectOffering.programId, semesterNumber: m.SubjectOffering.semesterNumber },
        include: [Section],
      });
      for (const po of offerings) {
        for (const sec of po.Sections) {
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
  if (req.query.duplicateFrom) {
    const source = await Assessment.findOne({ where: { id: req.query.duplicateFrom, createdById: req.currentUser.id } });
    if (source) {
      prefill = { title: source.title + " (Copy)", description: source.description, maxMarks: source.maxMarks, attachmentUrl: source.attachmentUrl };
    }
  }

  res.render("teacher/assessments/new", { title: "Create Assessment", targetOptions, error: null, formData: prefill, breadcrumbs: [ROOT, ASSESSMENTS, { label: "Create Assessment" }] });
};

exports.create = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);
  const targetOptions = await buildTargetOptions(teacherProfile);

  const { title, description, attachmentUrl, startAt, endAt, maxMarks } = req.body;
  let targets = req.body.targets || []; // format: "<subjectOfferingId>:<sectionId>"
  if (!Array.isArray(targets)) targets = [targets];

  const breadcrumbs = [ROOT, ASSESSMENTS, { label: "Create Assessment" }];
  const rerender = (error) =>
    res.status(400).render("teacher/assessments/new", { title: "Create Assessment", targetOptions, error, formData: req.body, breadcrumbs });

  if (!title || !startAt || !endAt || !maxMarks || !targets.length) {
    return rerender("Please fill in all fields and select at least one section to target.");
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
