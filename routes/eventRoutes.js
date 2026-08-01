const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const { requireAdmin } = require("../middlewares/adminAuth");

router.post("/", eventController.trackEvent);
router.get("/funnels", requireAdmin, eventController.getFunnels);

module.exports = router;
