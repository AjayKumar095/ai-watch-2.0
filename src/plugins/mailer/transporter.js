// Builds the nodemailer transporter from .env. Gmail + an App Password is
// the default (MAIL_USER / MAIL_APP_PASSWORD) since that's the common case
// for a small app like this; set MAIL_HOST/MAIL_PORT instead to point at
// any other SMTP provider without touching code.
const nodemailer = require("nodemailer");

let cachedTransporter = null;
let cachedIsConfigured = null;

function isConfigured() {
  if (cachedIsConfigured === null) {
    cachedIsConfigured = Boolean(process.env.MAIL_USER && process.env.MAIL_APP_PASSWORD);
  }
  return cachedIsConfigured;
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (cachedTransporter) return cachedTransporter;

  const auth = { user: process.env.MAIL_USER, pass: process.env.MAIL_APP_PASSWORD };
  // Nodemailer's defaults can leave a request hanging for minutes if the
  // mail server is unreachable (e.g. misconfigured host, blocked outbound
  // port). Bounding these means a bad mail config fails fast instead of
  // stalling whatever action triggered the email (an approval, a signup...).
  const timeouts = { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 };

  cachedTransporter = process.env.MAIL_HOST
    ? nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT) || 587,
        secure: Number(process.env.MAIL_PORT) === 465,
        auth,
        ...timeouts,
      })
    : nodemailer.createTransport({ service: process.env.MAIL_SERVICE || "gmail", auth, ...timeouts });

  return cachedTransporter;
}

function getFromHeader() {
  const name = process.env.MAIL_FROM_NAME || "AI-Watch";
  const address = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USER;
  return address ? `"${name}" <${address}>` : undefined;
}

module.exports = { getTransporter, getFromHeader, isConfigured };
