// A role-agnostic account directory for the superadmin — distinct from the
// existing Teachers/Students pages, which manage the role-specific profile
// data (employee code, roll number, etc). This page is for the account
// itself: name, email, role, active status, and account-level deletion.
//
// Deletion is deliberately careful. Several FKs on StudentProfile/
// TeacherProfile cascade (see migrations/…-baseline-schema.js), meaning a
// raw destroy() would silently wipe a student's entire academic history
// (enrollments, submissions, certificates, promotion records) with no
// error to catch — unlike a FK RESTRICT, cascade never throws. So role-
// specific dependents are counted and blocked proactively before we ever
// call destroy(); a thrown SequelizeForeignKeyConstraintError (from a
// RESTRICT elsewhere, e.g. assessments this user created) is still caught
// as a fallback.
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
  AuditLog,
} = require("../models");
const { safeDestroy } = require("../utils/deleteHelpers");

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

exports.delete = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.redirect("/admin/users");

  const cantDelete = (message) =>
    res.status(409).render("error", { title: "Can't delete", message });

  if (user.id === req.currentUser.id) {
    return cantDelete("You can't delete your own account while logged in as it.");
  }

  if (user.role === "SUPERADMIN") {
    const activeSuperadmins = await User.count({ where: { role: "SUPERADMIN", isActive: true } });
    if (activeSuperadmins <= 1 && user.isActive) {
      return cantDelete("This is the last active superadmin account — the portal would have no one left to manage it. Create another superadmin first.");
    }
  }

  if (user.role === "TEACHER") {
    const teacherProfile = await TeacherProfile.findOne({ where: { userId: user.id } });
    if (teacherProfile) {
      const mappingCount = await TeacherSubjectMapping.count({ where: { teacherId: teacherProfile.id } });
      const approvalCount = await ApprovalRequest.count({ where: { requestedTeacherId: teacherProfile.id } });
      if (mappingCount > 0 || approvalCount > 0) {
        return cantDelete(
          `This teacher still has ${mappingCount} subject mapping(s) and ${approvalCount} approval request(s). Remove/reassign those first, or deactivate the account instead of deleting it.`
        );
      }
    }
  }

  if (user.role === "STUDENT") {
    const studentProfile = await StudentProfile.findOne({ where: { userId: user.id } });
    if (studentProfile) {
      const [enrollmentCount, submissionCount, certificateCount, promotionCount, approvalCount] = await Promise.all([
        SubjectEnrollment.count({ where: { studentId: studentProfile.id } }),
        Submission.count({ where: { studentId: studentProfile.id } }),
        SemesterCertificate.count({ where: { studentId: studentProfile.id } }),
        PromotionRecord.count({ where: { studentId: studentProfile.id } }),
        ApprovalRequest.count({ where: { studentId: studentProfile.id } }),
      ]);
      const total = enrollmentCount + submissionCount + certificateCount + promotionCount + approvalCount;
      if (total > 0) {
        return cantDelete(
          `This student has academic history attached (${enrollmentCount} enrollment(s), ${submissionCount} submission(s), ${certificateCount} certificate(s), ${promotionCount} promotion record(s), ${approvalCount} approval request(s)). Deleting would erase all of it. Deactivate the account instead, or remove those records first if you're certain.`
        );
      }
    }
  }

  // Fallback net: a RESTRICT elsewhere (e.g. assessments this user created,
  // or a promotion batch they executed) throws rather than cascading —
  // safeDestroy turns that into the same friendly message instead of a 500.
  if (await safeDestroy(user, res, "/admin/users", "user")) {
    await AuditLog.create({ userId: req.currentUser.id, action: "DELETE_USER", entityType: "User", entityId: req.params.id, metadata: { role: user.role, email: user.email } });
    res.redirect("/admin/users");
  }
};
