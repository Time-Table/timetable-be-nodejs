const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");

router.post("/addSchedule", scheduleController.addSchedule);
router.post("/generateSchedule", scheduleController.generateSchedule);
router.get("/getSchedule", scheduleController.getSchedule);

module.exports = router;
