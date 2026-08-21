const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const adminController = require("../controllers/adminController");
const schoolController = require("../controllers/schoolController");
const programController = require("../controllers/programController");
const subjectPoolController = require("../controllers/subjectPoolController");
const academicSessionController = require("../controllers/academicSessionController");
const programOfferingController = require("../controllers/programOfferingController");
const sectionController = require("../controllers/sectionController");
const subjectOfferingController = require("../controllers/subjectOfferingController");

router.use(requireAuth, requireRole("SUPERADMIN"));

router.get("/dashboard", adminController.dashboard);
router.get("/teachers/new", adminController.showCreateTeacher);
router.post("/teachers/new", adminController.createTeacher);

router.get("/mappings", adminController.listMappings);
router.get("/mappings/new", adminController.showCreateMapping);
router.post("/mappings/new", adminController.createMapping);

router.get("/enroll", adminController.showEnroll);
router.post("/enroll/auto", adminController.autoEnroll);

// Schools
router.get("/schools", schoolController.list);
router.get("/schools/new", schoolController.showCreate);
router.post("/schools/new", schoolController.create);
router.post("/schools/:id/toggle", schoolController.toggleActive);

// Programs + Specializations
router.get("/programs", programController.list);
router.get("/programs/new", programController.showCreate);
router.post("/programs/new", programController.create);
router.get("/programs/:programId/specializations/new", programController.showCreateSpecialization);
router.post("/programs/:programId/specializations/new", programController.createSpecialization);

// Subject Pool
router.get("/subjects", subjectPoolController.list);
router.get("/subjects/new", subjectPoolController.showCreate);
router.post("/subjects/new", subjectPoolController.create);
router.get("/subjects/bulk-import", subjectPoolController.showBulkImport);
router.post("/subjects/bulk-import", subjectPoolController.bulkImport);

// Academic Sessions
router.get("/sessions", academicSessionController.list);
router.get("/sessions/new", academicSessionController.showCreate);
router.post("/sessions/new", academicSessionController.create);

// Program Offerings
router.get("/offerings", programOfferingController.list);
router.get("/offerings/new", programOfferingController.showCreate);
router.post("/offerings/new", programOfferingController.create);

// Sections & Sub-Groups
router.get("/sections", sectionController.list);
router.get("/sections/new", sectionController.showCreate);
router.post("/sections/new", sectionController.create);

// Subject Offerings
router.get("/subject-offerings", subjectOfferingController.list);
router.get("/subject-offerings/new", subjectOfferingController.showCreate);
router.post("/subject-offerings/new", subjectOfferingController.create);
router.get("/subject-offerings/bulk-attach", subjectOfferingController.showBulkAttach);
router.post("/subject-offerings/bulk-attach", subjectOfferingController.bulkAttach);

module.exports = router;
