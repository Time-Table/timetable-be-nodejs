const rateLimit = require("express-rate-limit");
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

module.exports = { createLimiter, generalLimiter };
