const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "public", "uploads", "assessment-content");

// Disk storage (unlike the CSV upload, these need to be served back as
// <img src> URLs) — filename is randomized to avoid collisions/path
// traversal from the original filename, but the original extension is kept.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  },
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const okMime = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"].includes(file.mimetype);
    if (okMime) return cb(null, true);
    cb(new Error("Please upload an image file (PNG, JPEG, GIF, WEBP, or SVG)."));
  },
});

module.exports = uploadImage;
