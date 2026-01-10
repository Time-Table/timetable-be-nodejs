const express = require("express");
const router = express.Router();
const tableController = require("../controllers/tableController");
const { createLimiter } = require("../middlewares/rateLimiters");

router.post("/create", createLimiter, tableController.createTable);
router.get("/tableInfo", tableController.getTableInfo);

module.exports = router;
