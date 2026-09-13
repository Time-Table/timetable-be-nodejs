const express = require("express");
const router = express.Router();
const blogViewController = require("../controllers/blogViewController");
const { requireAdmin } = require("../middlewares/adminAuth");
const { validateBlogView } = require("../middlewares/validators");
const { blogViewVisitorLimiter, blogViewIpLimiter } = require("../middlewares/rateLimiters");

// 블로그 글 조회 기록. 익명 수집이라 공개지만 slug·visitorId 형식 검증으로 오염을 막는다.
router.post(
  "/",
  blogViewIpLimiter,
  blogViewVisitorLimiter,
  validateBlogView,
  blogViewController.trackView,
);
// 글별 조회수·방문자·전환은 관리자만 본다.
router.get("/stats", requireAdmin, blogViewController.getStats);

module.exports = router;
