const express = require("express");
const router = express.Router();
const tableController = require("../controllers/tableController");
const { createLimiter } = require("../middlewares/rateLimiters");
const { validateTableCreate } = require("../middlewares/validators");

router.post("/", createLimiter, validateTableCreate, tableController.createTable);
router.get("/", tableController.getAllTables);
router.get("/:tableId", tableController.getTableInfo);
router.patch("/:tableId", tableController.updateTable);
router.delete("/:tableId", tableController.deleteTable);

module.exports = router;
