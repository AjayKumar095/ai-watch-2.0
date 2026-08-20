const router = require("express").Router();
const authController = require("../controllers/authController");

router.get("/login", authController.showLogin);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.post("/auth/refresh", authController.refresh);

router.get("/signup/student", authController.showStudentSignup);
router.post("/signup/student", authController.studentSignup);

module.exports = router;
