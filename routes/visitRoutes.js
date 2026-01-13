const express = require("express");
const router = express.Router();
const visitController = require("../controllers/visitController");

router.post("/", visitController.trackVisit);
router.get("/", visitController.getTrackVisit);

module.exports = router;
