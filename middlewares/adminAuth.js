const crypto = require("crypto");

/**
 * 길이가 달라도 안전하게 비교한다. 단순 === 비교는 앞자리부터 틀리는 순간
 * 반환되기 때문에 응답 시간으로 정답을 좁혀나갈 수 있다.
 */
const safeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;

  // 길이 자체가 타이밍으로 새지 않도록 해시로 고정 길이를 맞춘 뒤 비교한다.
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

/**
 * 관리자 전용 라우트 보호. 매니저 페이지가 로그인 후 받은 토큰을
 * X-Admin-Token 헤더로 보내면 서버의 ADMIN_TOKEN과 대조한다.
 */
const requireAdmin = (req, res, next) => {
  const expected = process.env.ADMIN_TOKEN;

  // 토큰이 설정되지 않았다면 열어두는 대신 잠근다. 설정 누락이 곧 무방비가 되면 안 된다.
  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "관리자 토큰이 서버에 설정되지 않았습니다.",
    });
  }

  if (!safeEqual(req.get("X-Admin-Token") || "", expected)) {
    return res.status(401).json({ success: false, message: "관리자 권한이 필요합니다." });
  }

  next();
};

module.exports = { requireAdmin, safeEqual };
