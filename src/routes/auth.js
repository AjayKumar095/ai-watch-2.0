const router = require("express").Router();
const authController = require("../controllers/authController");

router.get("/login", authController.showLogin);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.post("/auth/refresh", authController.refresh);

router.get("/forgot-password", authController.showForgotPassword);
router.post("/forgot-password", authController.forgotPassword);

router.get("/signup/student", authController.showStudentSignup);
router.post("/signup/student", authController.studentSignup);

// Public JSON endpoints for the signup form's cascading dropdowns.
router.get("/api/schools/:schoolId/programs", authController.programsForSchool);
router.get("/api/programs/:programId/specializations", authController.specializationsForProgram);

module.exports = router;
