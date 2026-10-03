const express = require("express");
const router = express.Router();
const statsController = require("../controllers/statsController");

// 랜딩 신뢰 표시용 공개 집계(2026-10-04 사람 지시). 어제까지 30일 참여 등록 건수. 하루에 한 번 바뀐다.
router.get("/landing", statsController.getLandingStats);

module.exports = router;
