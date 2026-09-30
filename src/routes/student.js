const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const studentController = require("../controllers/studentController");
const studentCertificateController = require("../controllers/studentCertificateController");
const { submissionUpload, MAX_FILES } = require("../middleware/submissionUpload");
const requireSectionSetup = require("../middleware/requireSectionSetup");

router.use(requireAuth, requireRole("STUDENT"));

// Promoted students must pick their new semester's section before the
// dashboard/assessment routes unlock (profile, certificates, and
// confirm-section stay open — see requireSectionSetup).
router.get("/dashboard", requireSectionSetup, studentController.dashboard);
router.get("/profile", studentController.showProfile);
router.post("/profile/section", studentController.chooseSection);
router.get("/assessments/:id", requireSectionSetup, studentController.showAssessment);
router.post(
  "/assessments/:id/submit",
  requireSectionSetup,
  (req, res, next) => {
    submissionUpload.array("attachments", MAX_FILES)(req, res, (err) => {
      if (err) {
        // Bad file type or over the size limit — multer/fileFilter throws
        // rather than calling next() cleanly, so it's caught here and
        // bounced back to the assessment page with a clear message instead
        // of an unhandled 500.
        return res.redirect(`/student/assessments/${req.params.id}?error=` + encodeURIComponent(err.message));
      }
      next();
    });
  },
  studentController.submitAssessment
);
router.post("/profile/group", studentController.updateSubGroup);

router.get("/confirm-section", studentController.showConfirmSection);
router.post("/confirm-section", studentController.confirmSection);

router.get("/certificates", studentCertificateController.list);
router.get("/certificates/:certificateId/download", studentCertificateController.download);

module.exports = router;
