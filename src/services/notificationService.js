// Central place for every "send an email about X" call in the app. Kept
// separate from controllers so the fire-and-forget try/catch pattern (a
// mail failure must never break the request that triggered it) lives in
// one place instead of being copy-pasted per controller.
const { sendTemplateMail } = require("../plugins/mailer");

const APP_URL = process.env.APP_URL || "http://localhost:3000";

async function safeSend(args) {
  try {
    return await sendTemplateMail(args);
  } catch (err) {
    console.error(`[mailer] Failed to send "${args.template}" to ${args.to}:`, err.message);
    return { skipped: true, error: err.message };
  }
}

// 1. Student signs up -> confirmation that the request went to their chosen teacher.
async function notifySignupReceived({ studentUser, teacherName }) {
  return safeSend({
    to: studentUser.email,
    template: "signup-received",
    data: { firstName: studentUser.firstName, teacherName },
  });
}

// 2. Teacher approves/rejects -> welcome + credentials, or a rejection note.
async function notifyApprovalDecision({ studentUser, rollNo, decision, decidedByName, note, tempPassword }) {
  if (decision === "APPROVED") {
    return safeSend({
      to: studentUser.email,
      template: "welcome",
      data: {
        firstName: studentUser.firstName,
        rollNo: rollNo || "",
        approvedBy: decidedByName,
        loginEmail: studentUser.email,
        tempPassword,
        loginUrl: `${APP_URL}/login`,
      },
    });
  }
  return safeSend({
    to: studentUser.email,
    template: "approval-decision",
    data: { firstName: studentUser.firstName, decidedBy: decidedByName, decision: decision.toLowerCase(), note: note || "" },
  });
}

// 3. Forgot password -> new temp password issued.
async function notifyPasswordReset({ user, tempPassword }) {
  return safeSend({
    to: user.email,
    template: "password-reset",
    data: { firstName: user.firstName, tempPassword, loginUrl: `${APP_URL}/login` },
  });
}

// 4. Assessment posted -> notify every enrolled student. Sent one-by-one so
// one bad address doesn't stop the rest of the batch.
async function notifyAssessmentCreated({ studentUsers, title, subjectName, mentorName, dueAt }) {
  const dueDate = new Date(dueAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const results = [];
  for (const studentUser of studentUsers) {
    results.push(
      await safeSend({
        to: studentUser.email,
        template: "assessment-created",
        data: {
          firstName: studentUser.firstName,
          title,
          subjectName,
          mentorName,
          dueDate,
          loginUrl: `${APP_URL}/login`,
        },
      })
    );
  }
  return results;
}

module.exports = {
  notifySignupReceived,
  notifyApprovalDecision,
  notifyPasswordReset,
  notifyAssessmentCreated,
};
