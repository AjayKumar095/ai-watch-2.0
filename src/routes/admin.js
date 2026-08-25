const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const adminController = require("../controllers/adminController");
const schoolController = require("../controllers/schoolController");
const programController = require("../controllers/programController");
const programWorkspaceController = require("../controllers/programWorkspaceController");
const subjectPoolController = require("../controllers/subjectPoolController");
const academicSessionController = require("../controllers/academicSessionController");
const programOfferingController = require("../controllers/programOfferingController");
const sectionController = require("../controllers/sectionController");
const subjectOfferingController = require("../controllers/subjectOfferingController");
const teacherAccountController = require("../controllers/teacherAccountController");
const studentAdminController = require("../controllers/studentAdminController");
const sessionCloneController = require("../controllers/sessionCloneController");
const promotionController = require("../controllers/promotionController");
const certificateController = require("../controllers/certificateController");
const auditLogController = require("../controllers/auditLogController");
const upload = require("../middleware/upload");

router.use(requireAuth, requireRole("SUPERADMIN"));

router.get("/dashboard", adminController.dashboard);
router.get("/teachers/new", adminController.showCreateTeacher);
router.post("/teachers/new", adminController.createTeacher);
router.get("/teachers", teacherAccountController.list);
router.get("/teachers/:id/edit", teacherAccountController.showEdit);
router.post("/teachers/:id/edit", teacherAccountController.edit);
router.post("/teachers/:id/delete", teacherAccountController.delete);
router.get("/students", studentAdminController.list);

router.get("/mappings", adminController.listMappings);
router.get("/mappings/new", adminController.showCreateMapping);
router.post("/mappings/new", adminController.createMapping);
router.post("/mappings/:id/delete", adminController.deleteMapping);

router.get("/enroll", adminController.showEnroll);
router.post("/enroll/auto", adminController.autoEnroll);

// Schools
router.get("/schools", schoolController.list);
router.get("/schools/new", schoolController.showCreate);
router.post("/schools/new", schoolController.create);
router.post("/schools/:id/toggle", schoolController.toggleActive);
router.get("/schools/:id/edit", schoolController.showEdit);
router.post("/schools/:id/edit", schoolController.edit);
router.post("/schools/:id/delete", schoolController.delete);

// Programs — literal paths first, then the workspace catch-all (:id)
router.get("/programs", programController.list);
router.get("/programs/new", programController.showCreate);
router.post("/programs/new", programController.create);

// Program Workspace — consolidated School->Program->Semester->Sections/
// Subjects/Mappings workflow. Tab/session/semester state lives in the URL
// query string so it survives a page reload.
router.get("/programs/:id", programWorkspaceController.show);
router.post("/programs/:id/edit", programWorkspaceController.updateOverview);
router.post("/programs/:id/toggle", programWorkspaceController.toggleActive);
router.post("/programs/:id/delete", programWorkspaceController.deleteProgram);
router.post("/programs/:id/specializations/new", programWorkspaceController.createSpecialization);
router.post("/programs/:id/specializations/:specId/edit", programWorkspaceController.updateSpecialization);
router.post("/programs/:id/specializations/:specId/delete", programWorkspaceController.deleteSpecialization);
router.post("/programs/:id/offerings/ensure", programWorkspaceController.ensureOffering);
router.post("/programs/:id/sections/new", programWorkspaceController.createSection);
router.post("/programs/:id/sections/:sectionId/delete", programWorkspaceController.deleteSection);
router.post("/programs/:id/subject-offerings/new", programWorkspaceController.createSubjectOffering);
router.post("/programs/:id/subject-offerings/:subjectOfferingId/delete", programWorkspaceController.deleteSubjectOffering);
router.post("/programs/:id/subject-offerings/:subjectOfferingId/mappings/new", programWorkspaceController.createMapping);
router.post("/programs/:id/subject-offerings/:subjectOfferingId/mappings/:mappingId/delete", programWorkspaceController.deleteMapping);

// Subject Pool
router.get("/subjects", subjectPoolController.list);
router.get("/subjects/new", subjectPoolController.showCreate);
router.post("/subjects/new", subjectPoolController.create);
router.get("/subjects/bulk-import", subjectPoolController.showBulkImport);
router.post("/subjects/bulk-import", upload.single("csvFile"), subjectPoolController.bulkImport);
router.get("/subjects/:id/edit", subjectPoolController.showEdit);
router.post("/subjects/:id/edit", subjectPoolController.edit);
router.post("/subjects/:id/delete", subjectPoolController.delete);
router.post("/subjects/:id/toggle", subjectPoolController.toggleActive);
router.post("/subjects/bulk-delete", subjectPoolController.bulkDelete);

// Academic Sessions
router.get("/sessions", academicSessionController.list);
router.get("/sessions/new", academicSessionController.showCreate);
router.post("/sessions/new", academicSessionController.create);
router.get("/sessions/:id/edit", academicSessionController.showEdit);
router.post("/sessions/:id/edit", academicSessionController.edit);
router.post("/sessions/:id/toggle", academicSessionController.toggleActive);
router.post("/sessions/:id/delete", academicSessionController.delete);

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

// Session Clone Forward
router.get("/session-clone", sessionCloneController.showClone);
router.post("/session-clone", sessionCloneController.clone);

// Promotions
router.get("/promotions", promotionController.list);
router.get("/promotions/new", promotionController.showPreviewForm);
router.post("/promotions/preview", promotionController.preview);
router.post("/promotions/commit", promotionController.commit);

// Certificates
router.get("/certificates", certificateController.list);
router.get("/certificates/new", certificateController.showGenerate);
router.post("/certificates/check", certificateController.checkAndPreview);
router.post("/certificates/generate", certificateController.generate);

// Audit Log
router.get("/audit-log", auditLogController.list);

module.exports = router;
