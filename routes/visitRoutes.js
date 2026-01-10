const express = require("express");
const router = express.Router();
const visitController = require("../controllers/visitController");

router.post("/trackVisit", visitController.trackVisit);
router.get("/getTrackVisit", visitController.getTrackVisit);

module.exports = router;
