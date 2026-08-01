const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const analyticsController = require("../controllers/analyticsController");
const { requireAdmin } = require("../middlewares/adminAuth");
const { adminLoginLimiter } = require("../middlewares/rateLimiters");

router.post("/login", adminLoginLimiter, adminController.login);
router.get("/verify", requireAdmin, adminController.verify);

// 아래는 모두 관리자 전용 분석 API
router.use(requireAdmin);

router.get("/trends", analyticsController.getTrends);
router.get("/audience", analyticsController.getAudience);
router.get("/chats", analyticsController.getChatFeed);
router.get("/tables/:tableId", analyticsController.getTableDetail);

module.exports = router;
