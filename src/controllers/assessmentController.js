const { Op } = require("sequelize");
const {
  Assessment,
  AssessmentSection,
  AssessmentSectionSpecialization,
  AssessmentStudentOverride,
  Section,
  ProgramOffering,
  SubjectOffering,
  SubjectPool,
  Program,
  Specialization,
  TeacherSubjectMapping,
  TeacherSubjectMappingSpecialization,
  TeacherProfile,
  Submission,
  StudentProfile,
  SubjectEnrollment,
  User,
} = require("../models");
const { notifyAssessmentCreated } = require("../services/notificationService");
const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("../middleware/submissionUpload");

// <input type="datetime-local"> sends a NAIVE string with no timezone
// offset (e.g. "2026-09-12T14:00"). Passing that straight to
// Assessment.create() lets it get parsed using whatever timezone the
// SERVER PROCESS happens to be running in — not necessarily India time —
// which silently shifts the stored instant by hours depending on
// deployment. That's what caused startAt/endAt to drift from what the
// teacher actually entered, which then surfaced as students seeing a
// "Not yet open" 403 even when the displayed window looked correct (the
// display was converting that same already-wrong stored value back to
// their local time). Fix: always interpret naive datetime-local strings
// as Asia/Kolkata wall-clock time explicitly, regardless of server TZ.
// If a string somehow already carries an explicit offset/Z, trust it as-is.
const INSTITUTION_UTC_OFFSET = "+05:30"; // Asia/Kolkata, no DST — update if the institution isn't IST
const INSTITUTION_UTC_OFFSET_MINUTES = 5 * 60 + 30; // same offset, in minutes, for the reverse (display) direction below
function toInstitutionUtc(value) {
  if (!value) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}${INSTITUTION_UTC_OFFSET}`);
}

// Inverse of the above, for pre-filling a <input type="datetime-local">
// with an existing UTC instant — shifts the epoch by the institution's
// fixed offset, then reads the UTC-formatted digits of THAT shifted
// instant, which are exactly the institution's local wall-clock digits.
// This works correctly regardless of the server process's own timezone.
function toInstitutionLocalInputValue(date) {
  if (!date) return "";
  const shifted = new Date(new Date(date).getTime() + INSTITUTION_UTC_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

const ROOT = { label: "Dashboard", url: "/teacher/dashboard" };
const ASSESSMENTS = { label: "Assessments", url: "/teacher/assessments" };

async function loadTeacherProfile(req) {
  return TeacherProfile.findOne({ where: { userId: req.currentUser.id } });
}

const {
  targetableSectionsForMapping,
  specializationIdsForMapping,
  enrollmentsForAssessmentSections,
} = require("../services/sectionScope");

// Builds the list of "subjectOffering + concrete section + specialization
// scope" combos a teacher can target. A mapping scoped to a specific
// top-level Section covers that whole class (including its sub-groups) as
// ONE target; a mapping scoped to a specific sub-group is scoped to just
// that sub-group; an "all sections" mapping (sectionId = null) expands to
// one option per TOP-LEVEL section under the offering (each of which still
// covers its own sub-groups) — see src/services/sectionScope.js for the
// shared hierarchy rule.
//
// Each option also carries specializationIds (the OWNING MAPPING's own
// scope — [] means the mapping covers ALL specializations of that
// section). This is what was missing before: a mapping scoped to only
// PG-1..5 offered "Section C" as a target with no record that the
// teacher's real authority stopped at PG-5 — so the resulting assessment
// was visible to the section's PG-6 students too, who belong to a
// different teacher's mapping. Carrying specializationIds through here is
// the first half of the fix; create() below is the second half (actually
// persisting it onto the AssessmentSection).
async function buildTargetOptions(teacherProfile) {
  const mappings = await TeacherSubjectMapping.findAll({
    where: { teacherId: teacherProfile.id },
    include: [
      { model: SubjectOffering, include: [SubjectPool, Program] },
      { model: Section, include: [{ model: Section, as: "parentSection" }] },
      { model: TeacherSubjectMappingSpecialization, as: "mappingSpecializations", include: [{ model: Specialization, as: "Specialization" }] },
    ],
  });

  // A sub-group's own name (e.g. "PG-1") is meaningless on its own — the
  // same "PG-1" label can exist under Section A, Section B, Section C,
  // etc. Every option's section needs to be labeled with its PARENT
  // section too when it has one, not just its own name.
  function labelFor(section) {
    if (!section) return "Unknown section";
    return section.parentSection ? `Section ${section.parentSection.name} - ${section.name}` : `Section ${section.name}`;
  }

  const options = [];
  for (const m of mappings) {
    const specializationIds = specializationIdsForMapping(m);
    const specializationNames = (m.mappingSpecializations || []).map((s) => s.Specialization.name);
    // Same encoding create() decodes: "ALL" or a sorted, comma-joined list
    // of specialization ids. Pre-computed here so the view never has to
    // reconstruct it.
    const specSignature = specializationIds.length ? specializationIds.slice().sort().join(",") : "ALL";

    if (m.sectionId) {
      options.push({
        subjectOfferingId: m.subjectOfferingId,
        subjectOffering: m.SubjectOffering,
        section: m.Section,
        sectionLabel: labelFor(m.Section),
        specializationIds,
        specializationNames,
        specSignature,
      });
    } else {
      // Scoped by admissionYear, not just programId+semesterNumber: a
      // program+semester pair is no longer unique to one cohort once
      // admissionYear represents "admission cohort" rather than "the
      // current year" — e.g. a fresh Sem-1 admit this year and a held-back
      // Sem-1 repeater from an earlier cohort can both exist at once. This
      // keeps "all sections" mappings pointed at the SAME cohort as the
      // subject offering itself, not every same-numbered semester ever run.
      const offerings = await ProgramOffering.findAll({
        where: {
          programId: m.SubjectOffering.programId,
          semesterNumber: m.SubjectOffering.semesterNumber,
          admissionYear: m.SubjectOffering.admissionYear,
        },
      });
      for (const po of offerings) {
        const topSections = await targetableSectionsForMapping(null, po.id);
        for (const sec of topSections) {
          // Top-level sections from this expansion never have a parent,
          // so labelFor is safe here too.
          options.push({
            subjectOfferingId: m.subjectOfferingId,
            subjectOffering: m.SubjectOffering,
            section: sec,
            sectionLabel: labelFor(sec),
            specializationIds,
            specializationNames,
            specSignature,
          });
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
  // Format: "<subjectOfferingId>:<sectionId>:<specSignature>", where
  // specSignature is either "ALL" or a comma-joined, sorted list of
  // specializationIds — this is what actually carries a target's
  // specialization scope from the checkbox the teacher picked through to
  // what gets persisted below. See buildTargetOptions above for where each
  // option's specializationIds comes from (the owning mapping's own scope).
  let targets = req.body.targets || [];
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
  // "same assessment across multiple global-subject programs at once"
  // fix). Each target now keeps its OWN specializationIds instead of being
  // flattened into a bare sectionId list — the same section can legitimately
  // appear twice with different specialization scopes if a teacher holds
  // two separate mappings on it (e.g. PG-1..5 via one mapping, and PG-6
  // via a second, unrelated one — unusual, but the data model allows it).
  const grouped = {};
  for (const t of targets) {
    const [subjectOfferingId, sectionId, specSignature] = t.split(":");
    const specializationIds = specSignature === "ALL" || !specSignature ? [] : specSignature.split(",").filter(Boolean);
    if (!grouped[subjectOfferingId]) grouped[subjectOfferingId] = [];
    grouped[subjectOfferingId].push({ sectionId, specializationIds });
  }

  const created = [];
  const mentorName = req.currentUser.fullName ? req.currentUser.fullName() : req.currentUser.firstName;

  for (const [subjectOfferingId, sectionTargets] of Object.entries(grouped)) {
    const assessment = await Assessment.create({
      subjectOfferingId,
      createdById: req.currentUser.id,
      title,
      description: description || null,
      attachmentUrl: attachmentUrl || null,
      startAt: toInstitutionUtc(startAt),
      endAt: toInstitutionUtc(endAt),
      maxMarks,
      isActive: true,
    });

    // Built alongside the DB rows so enrollmentsForAssessmentSections below
    // can use them immediately without a round-trip re-fetch.
    const createdAssessmentSections = [];

    for (const { sectionId, specializationIds } of sectionTargets) {
      const assessmentSection = await AssessmentSection.create({ assessmentId: assessment.id, sectionId });

      if (specializationIds.length > 0) {
        await AssessmentSectionSpecialization.bulkCreate(
          specializationIds.map((specializationId) => ({
            assessmentSectionId: assessmentSection.id,
            specializationId,
          }))
        );
      }

      createdAssessmentSections.push({
        sectionId,
        sectionSpecializations: specializationIds.map((specializationId) => ({ specializationId })),
      });
    }

    created.push(assessment);

    const subjectOffering = await SubjectOffering.findByPk(subjectOfferingId, { include: [SubjectPool] });
    const enrollments = await enrollmentsForAssessmentSections(subjectOfferingId, createdAssessmentSections);
    const studentUsers = enrollments.map((e) => e.StudentProfile.User);
    if (studentUsers.length) {
      notifyAssessmentCreated({
        studentUsers,
        title,
        subjectName: subjectOffering.SubjectPool.name,
        mentorName,
        dueAt: endAt,
      });
    }
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
    include: [
      { model: SubjectOffering, include: [SubjectPool] },
      {
        model: AssessmentSection,
        include: [
          Section,
          { model: AssessmentSectionSpecialization, as: "sectionSpecializations" },
        ],
      },
    ],
  });
  if (!assessment) return res.redirect("/teacher/assessments");

  // Same specialization- and sub-group-aware resolution used when the
  // assessment was created and when notifying students — this candidate
  // list previously used a bare section-only query with no specialization
  // check AND no sub-group expansion, so a teacher could grant a late-
  // submission exception to (or simply see in this list) students outside
  // their actual mapped scope.
  const enrollments = await enrollmentsForAssessmentSections(assessment.subjectOfferingId, assessment.AssessmentSections);

  res.render("teacher/assessments/override", {
    title: "Open Submission Window",
    assessment,
    enrollments,
    success: req.query.success || null,
    error: req.query.error || null,
    breadcrumbs: [ROOT, ASSESSMENTS, { label: assessment.title }, { label: "Open Submission Window" }],
  });
};

exports.applyOverride = async (req, res) => {
  const assessment = await Assessment.findOne({ where: { id: req.params.id, createdById: req.currentUser.id } });
  if (!assessment) return res.redirect("/teacher/assessments");

  let studentIds = req.body.studentIds || [];
  if (!Array.isArray(studentIds)) studentIds = [studentIds];

  // Previously an empty selection fell straight through to the success
  // redirect below — the for-loop just ran zero times, nothing threw, so
  // "Override applied" showed even though nothing was written. Guard it
  // explicitly so a genuinely empty submission is reported as an error
  // instead of a false success.
  if (!studentIds.length) {
    return res.redirect(`/teacher/assessments/${assessment.id}/override?error=no_students_selected`);
  }

  const { startAt, endAt } = req.body;
  const overrideStartAt = toInstitutionUtc(startAt);
  const overrideEndAt = toInstitutionUtc(endAt);

  // Was AssessmentStudentOverride.upsert({...}) — but this model's primary
  // key (id) uses a client-generated DataTypes.UUIDV4 default, so Sequelize
  // always has an `id` value ready before the query runs and targets
  // ON CONFLICT (id) instead of the real unique index on
  // (assessment_id, student_id). First write for a student succeeds as a
  // plain insert; re-applying an override for the SAME student generates a
  // new random id, misses the id conflict target, and hits the composite
  // unique constraint instead — an uncaught 23505 duplicate key error that
  // left the request hanging with no response. find-or-create against the
  // real composite key, then save(), sidesteps the conflict-target guessing
  // entirely, and the try/catch turns any future failure into a visible
  // ?error= instead of a silent hang.
  try {
    for (const studentId of studentIds) {
      const [override] = await AssessmentStudentOverride.findOrCreate({
        where: { assessmentId: assessment.id, studentId },
        defaults: { startAt: overrideStartAt, endAt: overrideEndAt },
      });
      override.startAt = overrideStartAt;
      override.endAt = overrideEndAt;
      await override.save();
      console.log("OVERRIDE WRITTEN:", assessment.id, studentIds);
    }
    
    res.redirect(`/teacher/assessments/${assessment.id}/override?success=override_applied`);
  } catch (err) {
    console.error("applyOverride failed:", err);
    res.redirect(`/teacher/assessments/${assessment.id}/override?error=override_failed`);
  }
};

// ---------------------------------------------------------------------------
// Edit — title, content, dates, and max marks. Deliberately does NOT let a
// teacher change which sections/subject offering the assessment targets:
// students may have already submitted or been notified against the
// original targets, and reassigning sections after the fact could silently
// orphan those submissions or notify the wrong cohort. To retarget, delete
// and recreate instead.
// ---------------------------------------------------------------------------
exports.showEdit = async (req, res) => {
  const assessment = await Assessment.findOne({
    where: { id: req.params.id, createdById: req.currentUser.id },
    include: [
      { model: SubjectOffering, include: [SubjectPool, Program] },
      {
        model: AssessmentSection,
        include: [
          Section,
          { model: AssessmentSectionSpecialization, as: "sectionSpecializations", include: [{ model: Specialization, as: "Specialization" }] },
        ],
      },
    ],
  });
  if (!assessment) return res.redirect("/teacher/assessments");

  res.render("teacher/assessments/edit", {
    title: "Edit Assessment",
    assessment,
    error: null,
    formData: {
      title: assessment.title,
      attachmentUrl: assessment.attachmentUrl,
      startAt: toInstitutionLocalInputValue(assessment.startAt),
      endAt: toInstitutionLocalInputValue(assessment.endAt),
      maxMarks: assessment.maxMarks,
    },
    // Passed to the client as the BlockNote editor's initialContent, same
    // as showCreate — pre-fills with the assessment's existing content.
    initialDescriptionJson: JSON.stringify(assessment.description || null),
    breadcrumbs: [ROOT, ASSESSMENTS, { label: assessment.title }, { label: "Edit" }],
  });
};

exports.edit = async (req, res) => {
  const assessment = await Assessment.findOne({
    where: { id: req.params.id, createdById: req.currentUser.id },
    include: [{ model: SubjectOffering, include: [SubjectPool, Program] }],
  });
  if (!assessment) return res.redirect("/teacher/assessments");

  const { title, attachmentUrl, startAt, endAt, maxMarks, descriptionBlocks } = req.body;
  const breadcrumbs = [ROOT, ASSESSMENTS, { label: assessment.title }, { label: "Edit" }];
  const rerender = (error) =>
    res.status(400).render("teacher/assessments/edit", {
      title: "Edit Assessment",
      assessment,
      error,
      formData: req.body,
      initialDescriptionJson: JSON.stringify(assessment.description || null),
      breadcrumbs,
    });

  if (!title || !startAt || !endAt || !maxMarks) {
    return rerender("Please fill in all fields.");
  }

  let description = assessment.description;
  if (descriptionBlocks) {
    try {
      description = JSON.parse(descriptionBlocks);
    } catch (e) {
      return rerender("Couldn't read the assessment content — please try again.");
    }
  }

  assessment.title = title;
  assessment.description = description || null;
  assessment.attachmentUrl = attachmentUrl || null;
  // Same timezone-safe parsing as create() and applyOverride() — editing
  // through a plain naive datetime-local string would otherwise reintroduce
  // the exact server-timezone-drift bug that was just fixed.
  assessment.startAt = toInstitutionUtc(startAt);
  assessment.endAt = toInstitutionUtc(endAt);
  assessment.maxMarks = maxMarks;
  await assessment.save();

  res.redirect("/teacher/assessments");
};

// ---------------------------------------------------------------------------
// Delete — removes the assessment and everything that depends on it:
// submissions (and their uploaded files on disk), per-student override
// windows, and the section-targeting rows. Confirmation that this is
// destructive lives client-side (a confirm() on the Delete button in
// teacher/assessments/index.ejs) — this handler assumes the teacher has
// already agreed once the request reaches here.
//
// Dependent rows are deleted explicitly rather than relying solely on the
// model association's onDelete: "CASCADE" option — several tables in this
// app were set up via hand-written migrations (see the comment block in
// models/TeacherSubjectMapping.js for a concrete example), so trusting
// that the actual DB foreign key constraint matches what the Sequelize
// association declares isn't safe without checking the real schema.
// ---------------------------------------------------------------------------
exports.delete = async (req, res) => {
  const assessment = await Assessment.findOne({ where: { id: req.params.id, createdById: req.currentUser.id } });
  if (!assessment) return res.redirect("/teacher/assessments");

  const submissions = await Submission.findAll({ where: { assessmentId: assessment.id } });

  for (const sub of submissions) {
    if (Array.isArray(sub.attachments)) {
      for (const att of sub.attachments) {
        const filePath = path.join(UPLOAD_DIR, path.basename(att.url));
        fs.unlink(filePath, () => {}); // best-effort — a missing file shouldn't block deletion
      }
    }
  }

  await Submission.destroy({ where: { assessmentId: assessment.id } });
  await AssessmentSection.destroy({ where: { assessmentId: assessment.id } });
  await AssessmentStudentOverride.destroy({ where: { assessmentId: assessment.id } });

  await assessment.destroy();

  res.redirect("/teacher/assessments");
};
