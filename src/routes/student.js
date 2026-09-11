const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const studentController = require("../controllers/studentController");

router.use(requireAuth, requireRole("STUDENT"));

router.get("/dashboard", studentController.dashboard);
router.get("/profile", studentController.showProfile);
router.post("/profile/section", studentController.chooseSection);
router.get("/assessments/:id", studentController.showAssessment);
router.post("/assessments/:id/submit", studentController.submitAssessment);

router.get("/confirm-section", studentController.showConfirmSection);
router.post("/confirm-section", studentController.confirmSection);

module.exports = router;
