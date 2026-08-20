const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const adminController = require("../controllers/adminController");

router.use(requireAuth, requireRole("SUPERADMIN"));

router.get("/dashboard", adminController.dashboard);
router.get("/teachers/new", adminController.showCreateTeacher);
router.post("/teachers/new", adminController.createTeacher);
router.get("/mappings/new", adminController.showCreateMapping);
router.post("/mappings/new", adminController.createMapping);
router.get("/enroll", adminController.showEnroll);
router.post("/enroll/auto", adminController.autoEnroll);

module.exports = router;
