const multer = require("multer");
const path = require("path");
const fs = require("fs");

// NOTE: mirrors the pattern assessmentController.uploadImage already uses
// for /uploads/assessment-content (a static /uploads mount somewhere in
// app.js). I don't have app.js to confirm the exact root it serves from —
// double check this resolves to the same place your static file server
// points at, and adjust if not.
const UPLOAD_DIR = path.join(__dirname, "..", "..", "public", "uploads", "submissions");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Includes both the legacy (.doc/.ppt) and modern (.docx/.pptx) Office
// extensions — restricting to only the legacy ones would block the vast
// majority of students, who save in the modern format by default. Adjust
// this list if you specifically want to exclude .docx/.pptx.
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];

const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5MB, combined across all files
const MAX_FILES = 5;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new Error(`"${file.originalname}" isn't an allowed file type. Only PDF, Word, and PowerPoint files are accepted.`)
    );
  }
  cb(null, true);
}

const submissionUpload = multer({
  storage,
  fileFilter,
  limits: {
    // Multer only enforces a PER-FILE limit, not a combined one across
    // multiple files — set generously here as a ceiling, with the real
    // combined-5MB check done in the controller after all files land
    // (see studentController.submitAssessment).
    fileSize: MAX_TOTAL_BYTES,
    files: MAX_FILES,
  },
});

module.exports = { submissionUpload, ALLOWED_EXTENSIONS, MAX_TOTAL_BYTES, MAX_FILES, UPLOAD_DIR };
