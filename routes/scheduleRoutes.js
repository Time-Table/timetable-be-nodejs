const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");
const { validateScheduleAdd } = require("../middlewares/validators");

router.post("/", validateScheduleAdd, scheduleController.addSchedule);
router.post("/generation", scheduleController.generateSchedule);
router.get("/", scheduleController.getSchedule);

module.exports = router;
