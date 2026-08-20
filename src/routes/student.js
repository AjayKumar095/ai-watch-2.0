const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const studentController = require("../controllers/studentController");

router.use(requireAuth, requireRole("STUDENT"));

router.get("/dashboard", studentController.dashboard);
router.get("/assessments/:id", studentController.showAssessment);
router.post("/assessments/:id/submit", studentController.submitAssessment);

module.exports = router;
