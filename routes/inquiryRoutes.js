const express = require("express");
const router = express.Router();
const inquiryController = require("../controllers/inquiryController");
const { validateInquiry } = require("../middlewares/validators");
const { inquiryLimiter } = require("../middlewares/rateLimiters");

// 문의하기 양식. 누구나 보낼 수 있어야 하므로 공개지만, IP 제한과 형식 검증을 거친다.
// 문의함 조회는 관리자 전용이라 adminRoutes의 GET /api/admin/inquiries에 있다.
router.post("/", inquiryLimiter, validateInquiry, inquiryController.createInquiry);

module.exports = router;
