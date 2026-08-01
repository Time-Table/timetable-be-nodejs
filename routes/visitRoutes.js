const express = require("express");
const router = express.Router();
const visitController = require("../controllers/visitController");
const { requireAdmin } = require("../middlewares/adminAuth");

router.post("/", visitController.trackVisit);
router.get("/", requireAdmin, visitController.getTrackVisit);

module.exports = router;
