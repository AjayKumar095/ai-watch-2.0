const router = require("express").Router();
const accountController = require("../controllers/accountController");
const { requireAuth } = require("../middleware/auth");

router.get("/change-password", requireAuth, accountController.showChangePassword);
router.post("/change-password", requireAuth, accountController.changePassword);

module.exports = router;
