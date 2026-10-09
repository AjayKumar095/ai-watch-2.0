// Admin-facing student directory with filters (school, program, section,
// sub-group, semester, free-text search). Filters combine via a single GET
// form (auto-submitting selects) so the whole filter state lives in the
// URL query string — consistent with the Program Workspace's tab pattern.
const { Op } = require("sequelize");
const models = require("../models");
const {
  StudentProfile,
  User,
  Program,
  School,
  Specialization,
  Section,
  ProgramOffering,
  AcademicYear,
} = models;

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };

exports.list = async (req, res) => {
  const { schoolId, programId, sectionId, subGroupId, semesterNumber, search } = req.query;

  const where = {};
  if (programId) {
    where.programId = programId;
  } else if (schoolId) {
    const programsInSchool = await Program.findAll({ where: { schoolId }, attributes: ["id"] });
    where.programId = programsInSchool.map((p) => p.id);
  }
  if (subGroupId) where.currentSectionId = subGroupId;
  else if (sectionId) where.currentSectionId = sectionId;
  if (semesterNumber) where.currentSemesterNumber = parseInt(semesterNumber, 10);

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const matchingUsers = await User.findAll({
      where: { [Op.or]: [{ firstName: { [Op.like]: term } }, { lastName: { [Op.like]: term } }, { email: { [Op.like]: term } }] },
      attributes: ["id"],
    });
    const matchingByRoll = await StudentProfile.findAll({ where: { rollNo: { [Op.like]: term } }, attributes: ["id"] });
    const matchingByUser = await StudentProfile.findAll({ where: { userId: matchingUsers.map((u) => u.id) }, attributes: ["id"] });
    const searchIds = [...new Set([...matchingByRoll.map((s) => s.id), ...matchingByUser.map((s) => s.id)])];
    where.id = searchIds; // empty array correctly yields "no results" rather than "no filter"
  }

  const students = await StudentProfile.findAll({
    where,
    include: [User, Program, Specialization, { model: Section, as: "currentSection" }],
    order: [["rollNo", "ASC"]],
    limit: 300,
  });

  // Filter dropdown options, cascaded server-side from whatever's already selected.
  const schools = await School.findAll({ where: { isActive: true }, order: [["name", "ASC"]] });
  const programWhere = schoolId ? { schoolId } : {};
  const programs = await Program.findAll({ where: programWhere, order: [["name", "ASC"]] });

  let sections = [];
  let subGroups = [];
  const sectionProgramFilter = programId ? { programId } : (schoolId ? { programId: (await Program.findAll({ where: { schoolId }, attributes: ["id"] })).map((p) => p.id) } : null);
  if (sectionProgramFilter) {
    // Sections belong to a ProgramOffering, which belongs to a Program — join through.
    const offerings = await ProgramOffering.findAll({ where: sectionProgramFilter, attributes: ["id"] });
    const offeringIds = offerings.map((o) => o.id);
    sections = await Section.findAll({ where: { programOfferingId: offeringIds, parentSectionId: null }, order: [["name", "ASC"]] });
    if (sectionId) {
      subGroups = await Section.findAll({ where: { parentSectionId: sectionId }, order: [["name", "ASC"]] });
    }
  }

  res.render("admin/students/index", {
    title: "Students",
    students,
    schools,
    programs,
    sections,
    subGroups,
    filters: { schoolId, programId, sectionId, subGroupId, semesterNumber, search },
    breadcrumbs: [ROOT, { label: "Students" }],
  });
};

// ===========================================================================
// Edit student (in place)
//
// Every change is an UPDATE on the existing StudentProfile / User rows — no new
// rows are created, so the student keeps the same id and everything that points
// at it by id (enrollments, assessments, ...) stays linked.
//
// Data model this relies on:
//
//   Program (totalSemesters) ──┬─ Specialization
//                              └─ ProgramOffering (programId + semesterNumber + admissionYear, isActive)
//                                     └─ Section (top level, parentSectionId = null)
//                                            └─ Section (sub-group, parentSectionId = section)
//
// So the valid choices cascade like this:
//   Program                → specializations
//   Program + Admission yr → semesters that have an ACTIVE offering
//   … + Semester           → sections of that offering
//   … + Section            → its sub-groups
//
// resolveOptions() is the single source of truth for that. It renders the form,
// answers the dropdown AJAX calls, and re-validates on save, so the UI and the
// server can never disagree.
// ===========================================================================

const STATUSES = ["ACTIVE", "GRADUATED", "ON_HOLD"];
const hasField = (Model, field) => Boolean(Model && Model.rawAttributes && Model.rawAttributes[field]);
const inList = (list, id) => list.some((x) => String(x.id) === String(id));
const idName = (rows) => rows.map((r) => ({ id: r.id, name: r.name }));

class FormError extends Error {
  constructor(errors) {
    super(errors.join(" "));
    this.errors = errors;
  }
}

// `keep` = the student's saved values. They stay selectable even if the program /
// specialization / year has since been deactivated, so merely opening and saving
// an old record doesn't fail on something the admin never touched.
async function resolveOptions({ programId, admissionYear, semesterNumber, sectionId, keep = {} }) {
  const out = { programs: [], admissionYears: [], specializations: [], semesters: [], sections: [], subGroups: [] };

  out.programs = await Program.findAll({
    where: { [Op.or]: [{ isActive: true }, ...(keep.programId ? [{ id: keep.programId }] : [])] },
    order: [["name", "ASC"]],
  });
  const years = await AcademicYear.findAll({
    where: { [Op.or]: [{ isActive: true }, ...(keep.admissionYear ? [{ admissionYear: keep.admissionYear }] : [])] },
    order: [["admissionYear", "DESC"]],
  });
  out.admissionYears = years.map((y) => ({ value: y.admissionYear, label: y.label }));

  if (!programId || !inList(out.programs, programId)) return out;
  const program = out.programs.find((p) => String(p.id) === String(programId));

  out.specializations = await Specialization.findAll({
    where: { programId, [Op.or]: [{ isActive: true }, ...(keep.specializationId ? [{ id: keep.specializationId }] : [])] },
    order: [["name", "ASC"]],
  });

  const yearOk = admissionYear && out.admissionYears.some((y) => y.value === Number(admissionYear));
  if (!yearOk) return out;

  const offerings = await ProgramOffering.findAll({ where: { programId, admissionYear: Number(admissionYear), isActive: true } });
  out.semesters = offerings
    .map((o) => o.semesterNumber)
    .filter((n) => n >= 1 && n <= program.totalSemesters)
    .sort((a, b) => a - b);

  if (semesterNumber) {
    const offering = offerings.find((o) => o.semesterNumber === Number(semesterNumber));
    if (offering) {
      out.sections = await Section.findAll({ where: { programOfferingId: offering.id, parentSectionId: null }, order: [["name", "ASC"]] });
    }
  }
  if (sectionId && inList(out.sections, sectionId)) {
    out.subGroups = await Section.findAll({ where: { parentSectionId: sectionId }, order: [["name", "ASC"]] });
  }
  return out;
}

// JSON endpoint behind the cascading dropdowns on the edit form.
exports.formOptions = async (req, res) => {
  const { programId, admissionYear, semesterNumber, sectionId } = req.query;
  const o = await resolveOptions({ programId, admissionYear, semesterNumber, sectionId });
  res.json({
    specializations: idName(o.specializations),
    semesters: o.semesters,
    sections: idName(o.sections),
    subGroups: idName(o.subGroups),
  });
};

// Keeps only the picks that are still valid together and reports what was dropped.
function reconcile(values, opts) {
  const notices = [];
  let { programId, admissionYear, specializationId, semesterNumber, sectionId, subGroupId } = values;

  if (programId && !inList(opts.programs, programId)) {
    programId = "";
    notices.push("The saved program is no longer available — please choose it again.");
  }
  if (admissionYear && !opts.admissionYears.some((y) => y.value === Number(admissionYear))) {
    admissionYear = "";
    notices.push("The saved admission year is not an active academic year — please choose it again.");
  }
  if (specializationId && !inList(opts.specializations, specializationId)) {
    specializationId = "";
    notices.push("The saved specialization does not belong to this program — please choose it again.");
  }
  if (semesterNumber && !opts.semesters.includes(Number(semesterNumber))) {
    semesterNumber = "";
    notices.push("The saved semester has no active offering for this program and admission year — enable it in the program workspace or choose another.");
  }
  if (sectionId && !inList(opts.sections, sectionId)) {
    sectionId = "";
    notices.push("The saved section does not belong to this program, admission year and semester — please choose it again.");
  }
  if (subGroupId && !inList(opts.subGroups, subGroupId)) subGroupId = "";

  return { programId: programId || "", admissionYear: admissionYear || "", specializationId: specializationId || "", semesterNumber: semesterNumber || "", sectionId: sectionId || "", subGroupId: subGroupId || "", notices };
}

const keepOf = (student) => ({
  programId: student.programId,
  admissionYear: student.admissionYear,
  specializationId: student.specializationId,
});

// One place that renders the edit page, so first load, validation errors and the
// "confirm impact" step all build their dropdowns the same way.
async function renderEdit(res, student, { status = 200, selected, errors = [], notices = [], form = null, impact = null }) {
  const opts = await resolveOptions({ ...selected, keep: keepOf(student) });
  return res.status(status).render("admin/students/edit", {
    title: `Edit ${student.User.firstName} ${student.User.lastName}`,
    student,
    statuses: STATUSES,
    ...opts,
    selected,
    errors,
    notices,
    form,
    impact,
    version: student.updatedAt ? new Date(student.updatedAt).toISOString() : "",
    breadcrumbs: [ROOT, { label: "Students", url: "/admin/students" }, { label: "Edit" }],
  });
}

exports.editForm = async (req, res) => {
  const student = await StudentProfile.findByPk(req.params.id, {
    include: [User, { model: Section, as: "currentSection" }],
  });
  if (!student) return res.status(404).render("errors/404", { title: "Not found" });

  // currentSectionId may hold a sub-group; split it back into section + sub-group.
  const cur = student.currentSection;
  const current = {
    programId: student.programId,
    admissionYear: student.admissionYear,
    specializationId: student.specializationId,
    semesterNumber: student.currentSemesterNumber,
    sectionId: cur ? (cur.parentSectionId || cur.id) : "",
    subGroupId: cur && cur.parentSectionId ? cur.id : "",
  };

  // Verify the saved profile against the rules, keep what is valid, flag the rest.
  const probe = await resolveOptions({ ...current, keep: keepOf(student) });
  const { notices, ...selected } = reconcile(current, probe);
  return renderEdit(res, student, { selected, notices });
};

// --- What depends on a student ---------------------------------------------

// Every model with a foreign key to student_profiles, found from the schema
// itself — so new tables that reference students (assessments, attempts, ...)
// are picked up automatically instead of being forgotten here.
function studentDependents() {
  const tableName = StudentProfile.getTableName();
  const table = typeof tableName === "string" ? tableName : tableName.tableName;
  const found = [];
  Object.values(StudentProfile.sequelize.models).forEach((Model) => {
    if (Model === StudentProfile) return;
    Object.entries(Model.rawAttributes).forEach(([attr, def]) => {
      const ref = def.references;
      if (!ref) return;
      const target = typeof ref.model === "string" ? ref.model : (ref.model.tableName || ref.model.name);
      if (target === table || target === "StudentProfile") found.push({ Model, attr });
    });
  });
  return found;
}

async function describeDependents(student, transaction) {
  const rows = [];
  for (const { Model, attr } of studentDependents()) {
    const count = await Model.count({ where: { [attr]: student.id }, transaction });
    if (count > 0) rows.push({ name: Model.name, count });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Keeping related records right when a student moves
//
// Rule: HISTORY IS NEVER REWRITTEN, only what is current moves.
//
//   * A SubjectEnrollment is the student's link to a subject offering. When the
//     student's placement (program / admission year / specialization / semester)
//     changes, enrollments belonging to the OLD placement are ENDED (isActive =
//     false, endedAt = now) — never deleted — and the student is enrolled in the
//     NEW placement's offerings. Teacher rosters and "who gets new assessments"
//     only look at ACTIVE enrollments, so the student leaves the old roster and
//     stops receiving the old class's new assessments.
//   * Submissions and evaluations hang off Assessment + student, not off the
//     enrollment, so they are untouched: the student keeps every past submission
//     and the teacher who created the assessment keeps evaluating it, whatever
//     section or semester the student has moved to since.
//   * A section move inside the same class only updates the section on the
//     student's ACTIVE enrollments (so the new section's teacher sees them);
//     ended enrollments keep the section they had at the time.
// ---------------------------------------------------------------------------

const specCompatible = (SubjectOffering, o, specId) =>
  !hasField(SubjectOffering, "specializationId") || !o.specializationId || String(o.specializationId) === String(specId || "");

// Does this subject offering belong to the given placement?
const fitsPlacement = (SubjectOffering, o, p) =>
  String(o.programId) === String(p.programId) &&
  o.semesterNumber === p.currentSemesterNumber &&
  o.admissionYear === p.admissionYear &&
  specCompatible(SubjectOffering, o, p.specializationId);

async function offeringsForPlacement(placement, transaction) {
  const { SubjectOffering } = models;
  const rows = await SubjectOffering.findAll({
    where: { programId: placement.programId, semesterNumber: placement.currentSemesterNumber, admissionYear: placement.admissionYear, isActive: true },
    transaction,
  });
  return rows.filter((o) => specCompatible(SubjectOffering, o, placement.specializationId));
}

// Runs inside the update transaction. Ends enrollments of the old placement and
// re-activates / re-sections enrollments that fit the new one. Enrollments that
// fit neither (e.g. a backlog subject from another semester) are left alone.
async function moveEnrollments(student, before, transaction) {
  const { SubjectEnrollment, SubjectOffering } = models;
  const out = { ended: 0, reactivated: 0 };
  const columnsOk = SubjectEnrollment && SubjectOffering &&
    hasField(SubjectEnrollment, "studentId") && hasField(SubjectEnrollment, "subjectOfferingId") &&
    ["programId", "semesterNumber", "admissionYear"].every((f) => hasField(SubjectOffering, f));
  if (!columnsOk) return out;

  if (!hasField(SubjectEnrollment, "isActive")) {
    const existing = await SubjectEnrollment.count({ where: { studentId: student.id }, transaction });
    if (existing) {
      throw new FormError(["Enrollments can't be ended yet: run the 'subject_enrollments is_active / ended_at' migration and restart the app, then try again."]);
    }
    return out;
  }

  const enrollments = await SubjectEnrollment.findAll({ where: { studentId: student.id }, transaction, lock: transaction.LOCK.UPDATE });
  if (!enrollments.length) return out;

  const offerings = await SubjectOffering.findAll({ where: { id: enrollments.map((e) => e.subjectOfferingId) }, transaction });
  const byId = new Map(offerings.map((o) => [String(o.id), o]));
  const now = new Date();
  const sectionCol = SubjectEnrollment.rawAttributes.sectionId;
  const canSetSection = hasField(SubjectEnrollment, "sectionId") && (student.currentSectionId || sectionCol.allowNull !== false);

  for (const e of enrollments) {
    const o = byId.get(String(e.subjectOfferingId));
    if (!o) continue;

    if (fitsPlacement(SubjectOffering, o, student)) {
      const patch = {};
      if (!e.isActive) {
        patch.isActive = true;
        if (hasField(SubjectEnrollment, "endedAt")) patch.endedAt = null;
        out.reactivated++;
      }
      if (canSetSection && String(e.sectionId || "") !== String(student.currentSectionId || "")) patch.sectionId = student.currentSectionId;
      if (Object.keys(patch).length) await e.update(patch, { transaction });
    } else if (e.isActive && fitsPlacement(SubjectOffering, o, before)) {
      const patch = { isActive: false };
      if (hasField(SubjectEnrollment, "endedAt")) patch.endedAt = now;
      await e.update(patch, { transaction });
      out.ended++;
    }
  }
  return out;
}

// After the commit: enroll the student in the new placement's offerings using the
// app's own enrollment rules (the same service the approval flow uses), then make
// sure those enrollments carry the student's current section. Kept outside the
// transaction because that service manages its own queries; if it fails the
// profile change is already saved and the admin is told to enroll manually.
async function enrollInNewPlacement(studentId) {
  try {
    const { SubjectEnrollment } = models;
    const fresh = await StudentProfile.findByPk(studentId, { include: [User] });
    if (!fresh || !fresh.isVerified || fresh.status !== "ACTIVE") return { ok: true, skipped: true };

    const { enrollStudentInOfferings } = require("../services/enrollmentService");
    await enrollStudentInOfferings(fresh);

    if (hasField(SubjectEnrollment, "sectionId") && fresh.currentSectionId) {
      const ids = (await offeringsForPlacement(fresh)).map((o) => o.id);
      if (ids.length) {
        await SubjectEnrollment.update(
          { sectionId: fresh.currentSectionId },
          { where: { studentId: fresh.id, subjectOfferingId: ids, ...(hasField(SubjectEnrollment, "isActive") ? { isActive: true } : {}) } }
        );
      }
    }
    return { ok: true };
  } catch (err) {
    console.error("Auto-enrollment after student edit failed:", err);
    return { ok: false };
  }
}

// Called inside the update transaction, so it all commits or all rolls back.
async function syncDependents(student, before, changes, transaction) {
  const summary = { enrollmentsEnded: 0, enrollmentsReactivated: 0, sectionCopiesUpdated: 0 };
  const placementChanged = changes.programChanged || changes.admissionYearChanged || changes.specializationChanged || changes.semesterChanged;

  if (placementChanged) {
    const r = await moveEnrollments(student, before, transaction);
    summary.enrollmentsEnded = r.ended;
    summary.enrollmentsReactivated = r.reactivated;
  } else if (changes.sectionChanged) {
    // Moving between sections of the same class (A -> B, or a sub-group change).
    summary.sectionCopiesUpdated = await syncSectionCopies(student, before, transaction);
  }
  return summary;
}

// Moving a student to another section of the same class: the ONLY record that keeps a
// copy of "the student's section right now" is their active SubjectEnrollment (it is what
// the teacher roster and the student's assessment visibility read), so only that moves.
//
// Deliberately NOT generic. Submission.sectionId also points at sections, but it is a
// HISTORICAL record — which class the student was in when they submitted — and the teacher's
// per-section grouping relies on it. Rewriting it on a section move would falsify history, so
// submissions, evaluations and overrides are never touched here. Ended enrollments keep the
// section they had at the time too.
async function syncSectionCopies(student, before, transaction) {
  const { SubjectEnrollment } = models;
  if (!hasField(SubjectEnrollment, "sectionId") || !hasField(SubjectEnrollment, "studentId")) return 0;

  if (!student.currentSectionId && SubjectEnrollment.rawAttributes.sectionId.allowNull === false) {
    throw new FormError(["Enrollments require a section, so this student's section can't be cleared. Pick a section instead."]);
  }
  const oldIds = before.sectionIds || [];
  if (!oldIds.length) return 0;

  const where = { studentId: student.id, sectionId: oldIds };
  if (hasField(SubjectEnrollment, "isActive")) where.isActive = true;
  const [count] = await SubjectEnrollment.update({ sectionId: student.currentSectionId }, { where, transaction });
  return count;
}

// A section (or sub-group) must have room for the student being moved into it.
async function assertCapacity(target, student, transaction) {
  if (!target || target.capacity == null) return;
  const children = await Section.findAll({ where: { parentSectionId: target.id }, attributes: ["id"], transaction });
  const ids = [target.id, ...children.map((c) => c.id)];
  const count = await StudentProfile.count({ where: { currentSectionId: ids, id: { [Op.ne]: student.id } }, transaction });
  if (count >= target.capacity) {
    throw new FormError([`${target.name} is full (${count}/${target.capacity}). Pick another section or raise its capacity.`]);
  }
}

exports.update = async (req, res) => {
  const student = await StudentProfile.findByPk(req.params.id, {
    include: [User, { model: Section, as: "currentSection" }],
  });
  if (!student) return res.status(404).render("errors/404", { title: "Not found" });

  const b = req.body;
  const errors = [];
  const clean = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());

  const firstName = clean(b.firstName);
  const lastName = clean(b.lastName) || "";
  const email = clean(b.email);
  const rollNo = clean(b.rollNo);
  const programId = clean(b.programId);
  const specializationId = clean(b.specializationId);
  const sectionId = clean(b.sectionId);
  const subGroupId = clean(b.subGroupId);
  const semesterNumber = parseInt(b.semesterNumber, 10);
  const admissionYear = parseInt(b.admissionYear, 10);
  const status = clean(b.status) || student.status;
  const isVerified = b.isVerified === "on" || b.isVerified === "true";

  if (!firstName) errors.push("First name is required.");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push("A valid email is required.");
  if (!rollNo) errors.push("Roll number is required.");
  if (!STATUSES.includes(status)) errors.push("Status is not valid.");

  if (rollNo) {
    const clash = await StudentProfile.findOne({ where: { rollNo, id: { [Op.ne]: student.id } } });
    if (clash) errors.push(`Roll number ${rollNo} is already used by another student.`);
  }
  if (email) {
    const clash = await User.findOne({ where: { email, id: { [Op.ne]: student.userId } } });
    if (clash) errors.push(`Email ${email} is already used by another account.`);
  }

  // Cross-field correctness: everything must belong together (a section of
  // Program A can never be saved against Program B, a semester must have an
  // active offering for that admission year, a sub-group must be in its section).
  const opts = await resolveOptions({ programId, admissionYear, semesterNumber, sectionId, keep: keepOf(student) });
  let newSection = null;

  if (!programId || !inList(opts.programs, programId)) errors.push("Choose a valid program.");
  if (!admissionYear || !opts.admissionYears.some((y) => y.value === admissionYear)) errors.push("Choose a valid admission year.");
  if (specializationId && !inList(opts.specializations, specializationId)) {
    errors.push("That specialization does not belong to the selected program.");
  }
  if (!semesterNumber || !opts.semesters.includes(semesterNumber)) {
    errors.push("That semester has no active offering for the selected program and admission year.");
  }
  if (sectionId) {
    if (!inList(opts.sections, sectionId)) errors.push("That section does not belong to the selected program, admission year and semester.");
    else newSection = opts.sections.find((s) => String(s.id) === sectionId);
  }
  if (subGroupId) {
    if (!sectionId) errors.push("Choose a section before choosing a sub-group.");
    else if (!inList(opts.subGroups, subGroupId)) errors.push("That sub-group does not belong to the selected section.");
    else newSection = opts.subGroups.find((g) => String(g.id) === subGroupId); // currentSectionId stores the most specific group
  }

  const picked = reconcile({ programId, admissionYear, specializationId, semesterNumber, sectionId, subGroupId }, opts);
  const { notices: _dropped, ...selected } = picked;

  if (errors.length) return renderEdit(res, student, { status: 422, selected, errors, form: b });

  const changes = {
    programChanged: String(student.programId) !== String(programId),
    admissionYearChanged: student.admissionYear !== admissionYear,
    specializationChanged: String(student.specializationId || "") !== String(specializationId || ""),
    semesterChanged: student.currentSemesterNumber !== semesterNumber,
    sectionChanged: String(student.currentSectionId || "") !== String(newSection ? newSection.id : ""),
  };
  const placementChanged = changes.programChanged || changes.admissionYearChanged || changes.specializationChanged || changes.semesterChanged;

  // A placement change touches data tied to the old placement — show what is
  // linked and require an explicit confirmation before going ahead.
  if (placementChanged && b.confirmImpact !== "on") {
    const impact = await describeDependents(student);
    if (impact.length) return renderEdit(res, student, { selected, form: b, impact });
  }

  const t = await StudentProfile.sequelize.transaction();
  try {
    // Lock the rows, then make sure nobody changed them since the form was opened.
    const locked = await StudentProfile.findByPk(student.id, { transaction: t, lock: t.LOCK.UPDATE });
    const userRow = await User.findByPk(locked.userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (b.version && new Date(b.version).getTime() !== new Date(locked.updatedAt).getTime()) {
      throw new FormError(["This student was changed by someone else after you opened the form. Reload the page and try again."]);
    }

    if (changes.sectionChanged) await assertCapacity(newSection, locked, t);

    const before = {
      programId: locked.programId,
      admissionYear: locked.admissionYear,
      specializationId: locked.specializationId,
      currentSemesterNumber: locked.currentSemesterNumber,
      // the old section and its parent: copies elsewhere may hold either one
      sectionIds: [locked.currentSectionId, student.currentSection && student.currentSection.parentSectionId].filter(Boolean),
    };

    const profileUpdate = {
      rollNo,
      programId,
      admissionYear,
      specializationId,
      currentSectionId: newSection ? newSection.id : null,
      currentSemesterNumber: semesterNumber,
      status,
      isVerified,
    };
    // sectionConfirmed drives the student's "confirm your sub-group" prompt:
    // a top-level section that has sub-groups, with none picked, still needs the student's pick.
    if (changes.sectionChanged || changes.programChanged || changes.semesterChanged) {
      profileUpdate.sectionConfirmed = newSection ? (Boolean(subGroupId) || opts.subGroups.length === 0) : false;
    }

    await userRow.update({ firstName, lastName, email }, { transaction: t });
    await locked.update(profileUpdate, { transaction: t });
    const summary = await syncDependents(locked, before, changes, t);
    await t.commit();

    // New placement => enroll in its subjects with the app's own enrollment rules.
    const enrolled = placementChanged ? await enrollInNewPlacement(student.id) : { ok: true };

    if (req.flash) {
      const parts = ["Student profile updated."];
      if (summary.enrollmentsEnded) parts.push(`${summary.enrollmentsEnded} enrollment(s) from the old placement were ended (their submissions and results are kept).`);
      if (summary.sectionCopiesUpdated) parts.push(`${summary.sectionCopiesUpdated} enrollment(s) moved to the new section.`);
      req.flash("success", parts.join(" "));
      if (!enrolled.ok) req.flash("error", "The profile was saved, but enrolling the student in the new semester's subjects failed — please enroll them manually.");
    }
    return res.redirect("/admin/students?search=" + encodeURIComponent(rollNo));
  } catch (err) {
    await t.rollback();
    if (err instanceof FormError) return renderEdit(res, student, { status: 422, selected, errors: err.errors, form: b });
    if (err.name === "SequelizeUniqueConstraintError") {
      return renderEdit(res, student, { status: 422, selected, errors: ["That roll number or email was just taken by another record."], form: b });
    }
    console.error("Student update failed:", err);
    return res.status(500).render("errors/500", { title: "Update failed", error: err });
  }
};
