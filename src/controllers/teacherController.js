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
const { hashPassword } = require("../utils/password");
const { sendTemplateMail } = require("../plugins/mailer");

// Fire-and-forget: a failed/unconfigured mailer should never block an
// approval decision. Errors are logged, not thrown.
async function notifyApprovalDecision({ studentUser, rollNo, decision, decidedByName, note }) {
  try {
    if (decision === "APPROVED") {
      await sendTemplateMail({
        to: studentUser.email,
        template: "welcome",
        data: {
          firstName: studentUser.firstName,
          rollNo: rollNo || "",
          approvedBy: decidedByName,
          loginUrl: `${process.env.APP_URL || "http://localhost:3000"}/login`,
        },
      });
    } else {
      await sendTemplateMail({
        to: studentUser.email,
        template: "approval-decision",
        data: { firstName: studentUser.firstName, decidedBy: decidedByName, decision: decision.toLowerCase(), note: note || "" },
      });
    }
  } catch (err) {
    console.error("[mailer] Failed to send approval-decision email:", err.message);
  }
}

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
  if (!request) return res.redirect("/teacher/dashboard");

  request.status = "APPROVED";
  request.decidedByUserId = req.currentUser.id;
  request.decidedAt = new Date();
  await request.save();

  request.StudentProfile.isVerified = true;
  await request.StudentProfile.save();

  const studentUser = request.StudentProfile.User;
  studentUser.isActive = true;
  await studentUser.save();

  // Sent inline via the mailer plugin (src/plugins/mailer) — swap for a
  // background job queue per the architecture report §4.2 if approval
  // volume ever makes inline sending too slow.
  await notifyApprovalDecision({
    studentUser,
    rollNo: request.StudentProfile.rollNo,
    decision: "APPROVED",
    decidedByName: req.currentUser.fullName ? req.currentUser.fullName() : req.currentUser.firstName,
  });

  res.redirect("/teacher/dashboard");
};

exports.rejectRequest = async (req, res) => {
  const teacherProfile = await loadTeacherProfile(req);
  const request = await ApprovalRequest.findOne({
    where: { id: req.params.id, requestedTeacherId: teacherProfile.id },
    include: [{ model: StudentProfile, include: [User] }],
  });
  if (!request) return res.redirect("/teacher/dashboard");

  request.status = "REJECTED";
  request.decidedByUserId = req.currentUser.id;
  request.decidedAt = new Date();
  await request.save();

  await notifyApprovalDecision({
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

  const requests = await ApprovalRequest.findAll({
    where: { id: ids, requestedTeacherId: teacherProfile.id, status: "PENDING" },
    include: [{ model: StudentProfile, include: [User] }],
  });

  for (const request of requests) {
    request.status = "APPROVED";
    request.decidedByUserId = req.currentUser.id;
    request.decidedAt = new Date();
    await request.save();
    request.StudentProfile.isVerified = true;
    await request.StudentProfile.save();
    request.StudentProfile.User.isActive = true;
    await request.StudentProfile.User.save();

    await notifyApprovalDecision({
      studentUser: request.StudentProfile.User,
      decision: "APPROVED",
      decidedByName: req.currentUser.fullName ? req.currentUser.fullName() : req.currentUser.firstName,
    });
  }

  res.redirect("/teacher/dashboard");
};
