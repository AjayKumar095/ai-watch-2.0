// System-level logging, separate from the AuditLog table (which records
// discrete admin actions like "created a program"). This is for the
// operational log stream: requests, errors, warnings from things like
// blocked deletes or failed logins — the kind of thing you'd tail in
// production to see what's actually happening, independent of who did
// what to which academic record.
//
// Size-based rotation, not date-based: each file caps at 5MB, and once
// there are 3 files winston deletes the oldest. With `tailable: true` the
// active file always stays named `app.log`; older ones become `app1.log`,
// `app2.log`, etc., so "which file is current" never depends on knowing
// today's date.
const fs = require("fs");
const path = require("path");
const winston = require("winston");

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LOG_FILE = path.join(LOG_DIR, "app.log");
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 3;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: LOG_FILE,
      maxsize: MAX_FILE_BYTES,
      maxFiles: MAX_FILES,
      tailable: true,
    }),
  ],
});

// Console output too, outside tests — same info a `tail -f` on the file
// would show, just human-readable instead of JSON, and without cluttering
// test runs.
if (process.env.NODE_ENV !== "test") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

module.exports = logger;
module.exports.LOG_DIR = LOG_DIR;
module.exports.MAX_FILE_BYTES = MAX_FILE_BYTES;
module.exports.MAX_FILES = MAX_FILES;
