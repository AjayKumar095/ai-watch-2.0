const multer = require("multer");

// In-memory storage — files are small CSVs, parsed immediately and
// discarded, never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB is generous for a subject-pool CSV
  fileFilter: (req, file, cb) => {
    const okExt = /\.(csv|txt)$/i.test(file.originalname);
    const okMime = ["text/csv", "text/plain", "application/vnd.ms-excel"].includes(file.mimetype);
    if (okExt || okMime) return cb(null, true);
    cb(new Error("Please upload a .csv file."));
  },
});

module.exports = upload;
