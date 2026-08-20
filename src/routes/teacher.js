const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const teacherController = require("../controllers/teacherController");
const assessmentController = require("../controllers/assessmentController");
const evaluationController = require("../controllers/evaluationController");

router.use(requireAuth, requireRole("TEACHER"));

router.get("/dashboard", teacherController.dashboard);
router.get("/roster", teacherController.roster);
router.post("/approvals/:id/approve", teacherController.approveRequest);
router.post("/approvals/:id/reject", teacherController.rejectRequest);
router.post("/approvals/bulk-approve", teacherController.bulkApprove);

router.get("/assessments", assessmentController.list);
router.get("/assessments/new", assessmentController.showCreate);
router.post("/assessments/new", assessmentController.create);
router.get("/assessments/:id/submissions", evaluationController.showSubmissions);
router.post("/assessments/:id/submissions/bulk-evaluate", evaluationController.bulkEvaluate);
router.post("/submissions/:submissionId/evaluate", evaluationController.evaluateOne);
router.get("/assessments/:id/override", assessmentController.showOverride);
router.post("/assessments/:id/override", assessmentController.applyOverride);

module.exports = router;
