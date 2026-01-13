const express = require("express");
const router = express.Router();
const tableController = require("../controllers/tableController");
const { createLimiter } = require("../middlewares/rateLimiters");
const { validateTableCreate } = require("../middlewares/validators");

router.post("/", createLimiter, validateTableCreate, tableController.createTable);
router.get("/:tableId", tableController.getTableInfo);

module.exports = router;
