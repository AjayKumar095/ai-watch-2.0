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

  cachedTransporter = process.env.MAIL_HOST
    ? nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT) || 587,
        secure: Number(process.env.MAIL_PORT) === 465,
        auth,
      })
    : nodemailer.createTransport({ service: process.env.MAIL_SERVICE || "gmail", auth });

  return cachedTransporter;
}

function getFromHeader() {
  const name = process.env.MAIL_FROM_NAME || "AI-Watch";
  const address = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USER;
  return address ? `"${name}" <${address}>` : undefined;
}

module.exports = { getTransporter, getFromHeader, isConfigured };
