const express = require("express");
const router = express.Router();
const tableAbController = require("../controllers/tableAbController");

// 표 화면 A/B 2회차 상태(공개, 2026-10-01, 하네스 specs/table-ab-2.md). 관리자 결과·시작·중단은 adminRoutes.
router.get("/table-ab", tableAbController.getState);

module.exports = router;
