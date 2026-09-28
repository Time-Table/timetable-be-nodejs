const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const analyticsController = require("../controllers/analyticsController");
const inquiryController = require("../controllers/inquiryController");
const experimentController = require("../controllers/experimentController");
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
router.get("/inquiries", inquiryController.getInquiries);
router.patch("/inquiries/:inquiryId", inquiryController.updateInquiryStatus);
router.delete("/inquiries/:inquiryId", inquiryController.deleteInquiry);
// 랜딩 A/B 1회차 결과·중단(2026-09-29, 하네스 specs/landing-ab-manager.md)
router.get("/experiments/landing-ab", experimentController.getLandingAb);
router.post("/experiments/landing-ab/stop", experimentController.stopLandingAb);

module.exports = router;
