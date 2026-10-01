const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const { requireAdmin } = require("../middlewares/adminAuth");

// text/plain: 페이지가 사라지는 중에 보내는 표 화면 A/B 기록(keepalive). JSON 본문은 app의 express.json이 읽는다.
router.post("/", express.text({ type: "text/plain", limit: "8kb" }), eventController.trackEvent);
router.get("/funnels", requireAdmin, eventController.getFunnels);

module.exports = router;
