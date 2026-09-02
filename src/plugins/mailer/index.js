// Mailer plugin — pick a JSON template, hand it data, send.
//
// Usage:
//   const { sendTemplateMail } = require("../plugins/mailer");
//   await sendTemplateMail({
//     to: user.email,
//     template: "welcome",
//     data: { firstName: user.firstName, rollNo: student.rollNo, approvedBy: "...", loginUrl: "..." },
//   });
//
// Adding a new email kind = adding a new templates/<name>.json file
// (subject / title / subtitle / body, with {{token}} placeholders) — no
// code changes needed elsewhere.
//
// If MAIL_USER / MAIL_APP_PASSWORD aren't set in .env, this logs what it
// would have sent instead of throwing, so the rest of the app keeps working
// in environments where mail isn't configured (e.g. a fresh dev checkout).
const { getTransporter, getFromHeader, isConfigured } = require("./transporter");
const { renderTemplate } = require("./templateEngine");

/**
 * @param {object} options
 * @param {string} options.to - recipient email address
 * @param {string} options.template - template filename under templates/, without .json
 * @param {object} [options.data] - values to fill {{tokens}} in the template
 * @param {string[]} [options.cc]
 */
async function sendTemplateMail({ to, template, data = {}, cc } = {}) {
  if (!to) throw new Error("sendTemplateMail: `to` is required");
  if (!template) throw new Error("sendTemplateMail: `template` is required");

  const { subject, html } = renderTemplate(template, data);

  if (!isConfigured()) {
    console.log(`[mailer] MAIL_USER/MAIL_APP_PASSWORD not set — skipping send. Would have sent "${template}" to ${to}: ${subject}`);
    return { skipped: true, subject };
  }

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: getFromHeader(),
    to,
    cc,
    subject,
    html,
  });

  return { skipped: false, messageId: info.messageId, subject };
}

module.exports = { sendTemplateMail };
