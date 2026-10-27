const express = require("express");
const c = require("../controllers/markSheetController");
const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/", c.page);
router.get("/classes", wrap(c.classes));
router.get("/csv", wrap(c.csv));
router.get("/zip", wrap(c.zip));
router.get("/master.csv", wrap(c.master));

module.exports = router;
