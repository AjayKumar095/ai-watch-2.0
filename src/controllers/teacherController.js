const {
  TeacherProfile,
  TeacherSubjectMapping,
  SubjectOffering,
  SubjectPool,
  SubjectEnrollment,
  StudentProfile,
  User,
  Section,
  Program,
  ApprovalRequest,
  Assessment,
  Submission,
} = require("../models");
const { hashPassword, generateTempPassword } = require("../utils/password");
const { notifyApprovalDecision } = require("../services/notificationService");
const logger = require("../utils/logger");

const ROOT = { label: "Dashboard", url: "/teacher/dashboard" };

async function loadTeacherProfile(req) {
  return TeacherProfile.findOne({ where: { userId: req.currentUser.id } });
}

exports.dashboard = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);

  const pendingApprovals = await ApprovalRequest.findAll({
    where: { requestedTeacherId: teacherProfile.id, status: "PENDING" },
    include: [{ model: StudentProfile, include: [User, Program] }],
    order: [["createdAt", "ASC"]],
  });

  const mappings = await TeacherSubjectMapping.findAll({
    where: { teacherId: teacherProfile.id },
    include: [
      { model: SubjectOffering, include: [SubjectPool, Program] },
      Section,
    ],
  });

  const assessmentCount = await Assessment.count({ where: { createdById: req.currentUser.id } });
  const pendingEvalCount = await Submission.count({
    where: { status: "PENDING" },
    include: [{ model: Assessment, where: { createdById: req.currentUser.id }, attributes: [] }],
  });

  res.render("teacher/dashboard", {
    title: "Teacher Dashboard",
    teacherProfile,
    pendingApprovals,
    mappings,
    assessmentCount,
    pendingEvalCount,
    breadcrumbs: [{ label: "Dashboard" }],
  });
};

// "Roster" — who I teach, and where, grouped by subject/program/section.
exports.roster = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);

  const mappings = await TeacherSubjectMapping.findAll({
    where: { teacherId: teacherProfile.id },
    include: [
      { model: SubjectOffering, include: [SubjectPool, Program] },
      Section,
    ],
  });

  const offeringIds = mappings.map((m) => m.subjectOfferingId);
  const enrollments = await SubjectEnrollment.findAll({
    where: { subjectOfferingId: offeringIds },
    include: [{ model: StudentProfile, include: [User] }, Section],
  });

  // Group enrollments by subject offering for the view.
  const grouped = {};
  for (const m of mappings) {
    grouped[m.subjectOfferingId] = {
      mapping: m,
      students: enrollments.filter((e) => e.subjectOfferingId === m.subjectOfferingId && (!m.sectionId || e.sectionId === m.sectionId)),
    };
  }

  res.render("teacher/roster", { title: "My Roster", grouped: Object.values(grouped), breadcrumbs: [ROOT, { label: "My Roster" }] });
};

exports.approveRequest = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);
  const request = await ApprovalRequest.findOne({
    where: { id: req.params.id, requestedTeacherId: teacherProfile.id },
    include: [{ model: StudentProfile, include: [User] }],
  });
  if (!request) {
    // Silently redirecting here used to look identical to success — a
    // teacher clicking Approve got no feedback at all if the request
    // didn't belong to them (wrong account) or had already been decided
    // (e.g. a double-click, or two teachers/tabs racing on the same
    // request). Now it's an explicit, loud failure instead.
    logger.warn("Approve request failed: no matching pending request", {
      approvalRequestId: req.params.id, teacherProfileId: teacherProfile.id, actingUserId: req.currentUser.id,
    });
    req.flash("error", "Couldn't approve that request — it may already have been decided, or it wasn't sent to you.");
    return res.redirect("/teacher/dashboard");
  }
  if (request.status !== "PENDING") {
    logger.warn("Approve request failed: request already decided", { approvalRequestId: request.id, status: request.status });
    req.flash("error", `This request was already ${request.status.toLowerCase()}.`);
    return res.redirect("/teacher/dashboard");
  }

  request.status = "APPROVED";
  request.decidedByUserId = req.currentUser.id;
  request.decidedAt = new Date();
  await request.save();

  request.StudentProfile.isVerified = true;
  await request.StudentProfile.save();

  const studentUser = request.StudentProfile.User;
  const tempPassword = generateTempPassword();
  studentUser.passwordHash = await hashPassword(tempPassword);
  studentUser.isActive = true;
  await studentUser.save();

  logger.info("Student approved", { approvalRequestId: request.id, studentUserId: studentUser.id, teacherProfileId: teacherProfile.id });

  // Fire-and-forget via the mailer plugin (src/plugins/mailer) — not
  // awaited, so a slow/unreachable mail server can't stall this approval.
  // Errors are caught and logged inside notificationService.js.
  notifyApprovalDecision({
    studentUser,
    rollNo: request.StudentProfile.rollNo,
    decision: "APPROVED",
    decidedByName: req.currentUser.fullName ? req.currentUser.fullName() : req.currentUser.firstName,
    tempPassword,
  });

  req.flash("success", `${studentUser.firstName} ${studentUser.lastName} approved — they've been emailed their login details.`);
  res.redirect("/teacher/dashboard");
};

exports.rejectRequest = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);
  const request = await ApprovalRequest.findOne({
    where: { id: req.params.id, requestedTeacherId: teacherProfile.id },
    include: [{ model: StudentProfile, include: [User] }],
  });
  if (!request) {
    logger.warn("Reject request failed: no matching pending request", {
      approvalRequestId: req.params.id, teacherProfileId: teacherProfile.id, actingUserId: req.currentUser.id,
    });
    req.flash("error", "Couldn't reject that request — it may already have been decided, or it wasn't sent to you.");
    return res.redirect("/teacher/dashboard");
  }
  if (request.status !== "PENDING") {
    logger.warn("Reject request failed: request already decided", { approvalRequestId: request.id, status: request.status });
    req.flash("error", `This request was already ${request.status.toLowerCase()}.`);
    return res.redirect("/teacher/dashboard");
  }

  request.status = "REJECTED";
  request.decidedByUserId = req.currentUser.id;
  request.decidedAt = new Date();
  await request.save();

  notifyApprovalDecision({
    studentUser: request.StudentProfile.User,
    decision: "REJECTED",
    decidedByName: req.currentUser.fullName ? req.currentUser.fullName() : req.currentUser.firstName,
    note: req.body.note,
  });

  res.redirect("/teacher/dashboard");
};

// Bulk approve — accepts requestIds[] from a multi-select form.
exports.bulkApprove = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);
  let ids = req.body.requestIds || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.filter(Boolean);

  if (!ids.length) {
    req.flash("error", "No students were selected — nothing was approved.");
    return res.redirect("/teacher/dashboard");
  }

  const requests = await ApprovalRequest.findAll({
    where: { id: ids, requestedTeacherId: teacherProfile.id, status: "PENDING" },
    include: [{ model: StudentProfile, include: [User] }],
  });

  if (!requests.length) {
    logger.warn("Bulk approve matched nothing", { requestedIds: ids, teacherProfileId: teacherProfile.id, actingUserId: req.currentUser.id });
    req.flash("error", "None of the selected requests could be approved — they may already have been decided.");
    return res.redirect("/teacher/dashboard");
  }
  if (requests.length < ids.length) {
    logger.warn("Bulk approve matched fewer requests than selected", { requestedCount: ids.length, matchedCount: requests.length, teacherProfileId: teacherProfile.id });
  }

  for (const request of requests) {
    request.status = "APPROVED";
    request.decidedByUserId = req.currentUser.id;
    request.decidedAt = new Date();
    await request.save();
    request.StudentProfile.isVerified = true;
    await request.StudentProfile.save();
    const tempPassword = generateTempPassword();
    request.StudentProfile.User.passwordHash = await hashPassword(tempPassword);
    request.StudentProfile.User.isActive = true;
    await request.StudentProfile.User.save();

    notifyApprovalDecision({
      studentUser: request.StudentProfile.User,
      rollNo: request.StudentProfile.rollNo,
      decision: "APPROVED",
      decidedByName: req.currentUser.fullName ? req.currentUser.fullName() : req.currentUser.firstName,
      tempPassword,
    });
  }

  logger.info("Bulk approved students", { count: requests.length, teacherProfileId: teacherProfile.id });
  req.flash("success", `${requests.length} student(s) approved and emailed their login details.` + (requests.length < ids.length ? ` (${ids.length - requests.length} selected request(s) couldn't be approved.)` : ""));
  res.redirect("/teacher/dashboard");
};
