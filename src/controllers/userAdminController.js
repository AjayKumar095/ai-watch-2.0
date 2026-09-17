// A role-agnostic account directory for the superadmin — distinct from the
// existing Teachers/Students pages, which manage the role-specific profile
// data (employee code, roll number, etc). This page is for the account
// itself: name, email, role, active status, and account-level deletion.
//
// Deletion has two steps, not a hard wall. The first attempt shows exactly
// what's attached (most StudentProfile/TeacherProfile FKs cascade at the DB
// level — see migrations/…-baseline-schema.js — so a raw destroy() would
// silently wipe a student's whole academic history with no error to catch,
// unlike a FK RESTRICT). Rather than only ever refusing, that same page
// offers "delete everything anyway" for when that's genuinely what's
// wanted — it re-submits with `force=1`, which skips the soft checks and
// destroys directly, relying on DB cascade for students (confirmed CASCADE
// on every student_id FK) and a small manual pre-clean for teachers (see
// below). A few things stay hard blocks even under force: your own
// account, the last active superadmin, and real academic content a
// TEACHER/SUPERADMIN created themselves (assessments, executed promotion
// batches) — those use FK RESTRICT on purpose and force-deleting through
// them would silently orphan grades or promotion history.
const { Op } = require("sequelize");
const {
  User,
  TeacherProfile,
  StudentProfile,
  School,
  Program,
  TeacherSubjectMapping,
  ApprovalRequest,
  SubjectEnrollment,
  Submission,
  SemesterCertificate,
  PromotionRecord,
  Assessment,
  PromotionBatch,
  AuditLog,
  sequelize,
} = require("../models");
const { safeDestroy } = require("../utils/deleteHelpers");
const logger = require("../utils/logger");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const USERS = { label: "Users", url: "/admin/users" };

exports.list = async (req, res) => {
  const { role, search } = req.query;

  const where = {};
  if (role) where.role = role;
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [{ firstName: { [Op.like]: term } }, { lastName: { [Op.like]: term } }, { email: { [Op.like]: term } }];
  }

  const users = await User.findAll({
    where,
    include: [
      { model: TeacherProfile, include: [School] },
      { model: StudentProfile, include: [Program] },
    ],
    order: [["role", "ASC"], ["firstName", "ASC"]],
    limit: 500,
  });

  res.render("admin/users/index", {
    title: "Users",
    users,
    filters: { role, search },
    breadcrumbs: [ROOT, USERS],
  });
};

exports.showEdit = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.redirect("/admin/users");
  res.render("admin/users/edit", {
    title: "Edit User", user, error: null,
    breadcrumbs: [ROOT, USERS, { label: user.fullName() }],
  });
};

exports.edit = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.redirect("/admin/users");
  const { firstName, lastName, email, isActive } = req.body;
  const breadcrumbs = [ROOT, USERS, { label: user.fullName() }];
  const rerender = (error, status = 400) =>
    res.status(status).render("admin/users/edit", { title: "Edit User", user, error, breadcrumbs });

  if (!firstName || !lastName || !email) {
    return rerender("Name and email are required.");
  }

  const existing = await User.findOne({ where: { email } });
  if (existing && existing.id !== user.id) {
    return rerender("Another account already uses this email.");
  }

  // Deactivating (or reactivating) yourself here would be confusing —
  // require them to do that from a different account instead.
  if (user.id === req.currentUser.id && isActive !== "on") {
    return rerender("You can't deactivate your own account while logged in as it.");
  }

  user.firstName = firstName;
  user.lastName = lastName;
  user.email = email;
  user.isActive = isActive === "on";
  await user.save();

  await AuditLog.create({ userId: req.currentUser.id, action: "UPDATE_USER", entityType: "User", entityId: user.id, metadata: {} });
  res.redirect("/admin/users");
};

// Gathers exactly what's attached to a user, without deleting anything.
// Shared by the confirm-delete screen and the delete handler so the counts
// shown to the admin are always the same ones the delete decision uses.
async function countDependents(user) {
  if (user.role === "TEACHER") {
    const teacherProfile = await TeacherProfile.findOne({ where: { userId: user.id } });
    if (!teacherProfile) return { items: [], hardBlocked: null };
    const [mappingCount, approvalCount, assessmentCount] = await Promise.all([
      TeacherSubjectMapping.count({ where: { teacherId: teacherProfile.id } }),
      ApprovalRequest.count({ where: { requestedTeacherId: teacherProfile.id } }),
      Assessment.count({ where: { createdById: user.id } }),
    ]);
    const items = [];
    if (mappingCount > 0) items.push({ label: "subject mapping(s)", count: mappingCount, forceable: true });
    if (approvalCount > 0) items.push({ label: "approval request(s) awaiting their review", count: approvalCount, forceable: true });
    if (assessmentCount > 0) items.push({ label: "assessment(s) they created (with any submissions/grades)", count: assessmentCount, forceable: false });
    return {
      items,
      hardBlocked: assessmentCount > 0
        ? `They created ${assessmentCount} assessment(s). Reassign or delete those first (via Assessments) — deleting the account can't safely take submitted work and grades with it.`
        : null,
    };
  }

  if (user.role === "STUDENT") {
    const studentProfile = await StudentProfile.findOne({ where: { userId: user.id } });
    if (!studentProfile) return { items: [], hardBlocked: null };
    const [enrollmentCount, submissionCount, certificateCount, promotionCount, approvalCount] = await Promise.all([
      SubjectEnrollment.count({ where: { studentId: studentProfile.id } }),
      Submission.count({ where: { studentId: studentProfile.id } }),
      SemesterCertificate.count({ where: { studentId: studentProfile.id } }),
      PromotionRecord.count({ where: { studentId: studentProfile.id } }),
      ApprovalRequest.count({ where: { studentId: studentProfile.id } }),
    ]);
    const items = [];
    if (enrollmentCount > 0) items.push({ label: "subject enrollment(s)", count: enrollmentCount, forceable: true });
    if (submissionCount > 0) items.push({ label: "submission(s)", count: submissionCount, forceable: true });
    if (certificateCount > 0) items.push({ label: "certificate(s)", count: certificateCount, forceable: true });
    if (promotionCount > 0) items.push({ label: "promotion record(s)", count: promotionCount, forceable: true });
    if (approvalCount > 0) items.push({ label: "approval request(s)", count: approvalCount, forceable: true });
    return { items, hardBlocked: null };
  }

  if (user.role === "SUPERADMIN") {
    const executedCount = await PromotionBatch.count({ where: { executedById: user.id } });
    return {
      items: executedCount > 0 ? [{ label: "promotion batch(es) they executed", count: executedCount, forceable: false }] : [],
      hardBlocked: executedCount > 0
        ? `They executed ${executedCount} promotion batch(es). That history is kept for audit purposes and can't be deleted through this account.`
        : null,
    };
  }

  return { items: [], hardBlocked: null };
}

exports.showConfirmDelete = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.redirect("/admin/users");
  const { items, hardBlocked } = await countDependents(user);
  res.render("admin/users/confirm-delete", {
    title: "Delete User", user, items, hardBlocked,
    breadcrumbs: [ROOT, USERS, { label: user.fullName() }],
  });
};

exports.delete = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.redirect("/admin/users");
  const force = req.body && (req.body.force === "on" || req.body.force === "1");

  const cantDelete = (message) => res.status(409).render("error", { title: "Can't delete", message });

  // These two never yield to force — bypassing either can brick admin
  // access to the portal.
  if (user.id === req.currentUser.id) {
    return cantDelete("You can't delete your own account while logged in as it.");
  }
  if (user.role === "SUPERADMIN") {
    const activeSuperadmins = await User.count({ where: { role: "SUPERADMIN", isActive: true } });
    if (activeSuperadmins <= 1 && user.isActive) {
      return cantDelete("This is the last active superadmin account — the portal would have no one left to manage it. Create another superadmin first.");
    }
  }

  const { items, hardBlocked } = await countDependents(user);

  if (hardBlocked) {
    return cantDelete(hardBlocked);
  }

  if (items.length && !force) {
    // Redirect to the confirm screen instead of dead-ending on an error —
    // it shows the same counts plus a "delete everything anyway" button.
    return res.redirect(`/admin/users/${user.id}/delete-confirm`);
  }

  // Force path: student dependents are all DB-level CASCADE, so destroying
  // the user is enough. Teacher dependents include one RESTRICT
  // (approval_requests.requested_teacher_id) that cascade can't clear on
  // its own, so it's removed explicitly first, inside the same transaction
  // as the destroy — if anything fails, nothing is left half-deleted.
  try {
    await sequelize.transaction(async (t) => {
      if (user.role === "TEACHER" && force) {
        const teacherProfile = await TeacherProfile.findOne({ where: { userId: user.id }, transaction: t });
        if (teacherProfile) {
          await ApprovalRequest.destroy({ where: { requestedTeacherId: teacherProfile.id }, transaction: t });
        }
      }
      await user.destroy({ transaction: t });
    });
  } catch (err) {
    if (err.name === "SequelizeForeignKeyConstraintError") {
      logger.warn("Blocked force-delete of user due to unexpected FK constraint", { userId: user.id, role: user.role, error: err.message });
      return cantDelete("This account still has other records depending on it that couldn't be safely removed automatically. Check assessments, submissions, or promotion history tied to it.");
    }
    throw err;
  }

  await AuditLog.create({
    userId: req.currentUser.id,
    action: force ? "FORCE_DELETE_USER" : "DELETE_USER",
    entityType: "User",
    entityId: req.params.id,
    metadata: { role: user.role, email: user.email, removedDependents: items },
  });
  logger.info(`User ${force ? "force-" : ""}deleted`, { deletedUserId: req.params.id, role: user.role, email: user.email, by: req.currentUser.email });
  res.redirect("/admin/users");
};
