const express = require("express");
const router = express.Router();
const tableController = require("../controllers/tableController");
const { createLimiter } = require("../middlewares/rateLimiters");

router.post("/", createLimiter, tableController.createTable);
router.get("/:tableId", tableController.getTableInfo);

module.exports = router;
