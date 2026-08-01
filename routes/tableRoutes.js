const express = require("express");
const router = express.Router();
const tableController = require("../controllers/tableController");
const { createLimiter } = require("../middlewares/rateLimiters");
const { validateTableCreate } = require("../middlewares/validators");
const { requireAdmin } = require("../middlewares/adminAuth");

router.post("/", createLimiter, validateTableCreate, tableController.createTable);
// 단일 테이블 조회만 공개. 전체 목록과 수정/삭제는 관리자 전용이다.
router.get("/:tableId", tableController.getTableInfo);
router.get("/", requireAdmin, tableController.getAllTables);
router.patch("/:tableId", requireAdmin, tableController.updateTable);
router.delete("/:tableId", requireAdmin, tableController.deleteTable);

module.exports = router;
