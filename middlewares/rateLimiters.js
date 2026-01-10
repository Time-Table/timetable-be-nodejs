const rateLimit = require("express-rate-limit");

const createLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 8,
  message: "연속적인 생성 요청은 제한됩니다. 잠시 후 다시 시도하세요.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => req.method === "OPTIONS",
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 1500, // 1분 당 30명*50회
  message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => req.method === "OPTIONS",
});

module.exports = { createLimiter, generalLimiter };
