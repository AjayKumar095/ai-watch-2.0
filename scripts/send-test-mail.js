// Quick manual test for the mailer plugin.
//
//   npm run mail:test -- you@example.com
//   npm run mail:test -- you@example.com certificate-issued
//
// (the `--` is needed so npm passes the args through instead of eating them)
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { sendTemplateMail } = require("../src/plugins/mailer");

const [to, template = "welcome"] = process.argv.slice(2);

if (!to) {
  console.error("Usage: npm run mail:test -- <to-email> [template-name]");
  process.exit(1);
}

const sampleData = {
  welcome: { firstName: "Alex", rollNo: "STU-0001", approvedBy: "Dr. Smith", loginUrl: "http://localhost:3000/login" },
  "approval-decision": { firstName: "Alex", decidedBy: "Dr. Smith", decision: "rejected", note: "Please re-submit with a valid teacher selection." },
  "certificate-issued": {
    firstName: "Alex",
    semesterNumber: 3,
    programName: "B.Tech CSE",
    verificationCode: "CERT-TEST-0001",
    certificateUrl: "http://localhost:3000/certificates/test",
  },
}[template] || {};

sendTemplateMail({ to, template, data: sampleData })
  .then((result) => {
    if (result.skipped) {
      console.log("Mail not sent (MAIL_USER/MAIL_APP_PASSWORD not configured in .env).");
    } else {
      console.log(`Sent "${template}" to ${to}. Message ID: ${result.messageId}`);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to send test mail:", err.message);
    process.exit(1);
  });
