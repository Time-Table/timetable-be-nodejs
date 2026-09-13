const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { RATE_LIMIT } = require("../utils/constants");

const createLimiter = rateLimit({
  windowMs: RATE_LIMIT.CREATE_WINDOW_MS,
  limit: RATE_LIMIT.CREATE_MAX,
  message: "연속적인 생성 요청은 제한됩니다. 잠시 후 다시 시도하세요.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => req.method === "OPTIONS",
});

const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT.GENERAL_WINDOW_MS,
  limit: RATE_LIMIT.GENERAL_MAX, // 1분 당 30명*50회
  message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => req.method === "OPTIONS",
});

// 관리자 비밀번호 무차별 대입을 막는다. 일반 요청보다 훨씬 빡빡하게 건다.
const adminLoginLimiter = rateLimit({
  windowMs: RATE_LIMIT.ADMIN_LOGIN_WINDOW_MS,
  limit: RATE_LIMIT.ADMIN_LOGIN_MAX,
  message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req, res) => req.method === "OPTIONS",
});

// 블로그 조회 기록(영구 저장)의 무의미한 적재를 막는다. 두 겹이다.
// 1) 브라우저(visitorId)당 — 한 사람이 1분에 20편을 읽지는 않는다.
//    visitorId가 없으면(검증 전 단계) IP로 센다.
const blogViewVisitorLimiter = rateLimit({
  windowMs: RATE_LIMIT.BLOG_VIEW_WINDOW_MS,
  limit: RATE_LIMIT.BLOG_VIEW_VISITOR_MAX,
  keyGenerator: (req) =>
    typeof req.body?.visitorId === "string" && req.body.visitorId
      ? `visitor:${req.body.visitorId.slice(0, 64)}`
      : `ip:${ipKeyGenerator(req.ip)}`,
  // 키가 IP가 아니라서 IPv6 폴백 검사가 의미 없다. 경고를 끈다.
  validate: { keyGeneratorIpFallback: false },
  message: "조회 기록 요청이 너무 많습니다.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => req.method === "OPTIONS",
});

// 2) IP당 — 공유망의 정상 독자가 잘리지 않을 만큼 넉넉하되, visitorId를 바꿔 가며 적재하는 것을 막는다.
const blogViewIpLimiter = rateLimit({
  windowMs: RATE_LIMIT.BLOG_VIEW_WINDOW_MS,
  limit: RATE_LIMIT.BLOG_VIEW_IP_MAX,
  message: "조회 기록 요청이 너무 많습니다.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => req.method === "OPTIONS",
});

module.exports = {
  createLimiter,
  generalLimiter,
  adminLoginLimiter,
  blogViewVisitorLimiter,
  blogViewIpLimiter,
};
