const { safeEqual } = require("../middlewares/adminAuth");

/**
 * 관리자 로그인. 비밀번호가 맞으면 이후 요청에 쓸 토큰을 내려준다.
 * 비밀번호 자체는 매 요청마다 오가지 않는다.
 */
const login = (req, res) => {
  const { password } = req.body;
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || !process.env.ADMIN_TOKEN) {
    return res.status(503).json({
      success: false,
      message: "관리자 인증이 서버에 설정되지 않았습니다.",
    });
  }

  if (!safeEqual(password || "", expected)) {
    return res.status(401).json({ success: false, message: "비밀번호가 틀렸습니다." });
  }

  return res.status(200).json({
    success: true,
    data: { token: process.env.ADMIN_TOKEN },
  });
};

/** 저장된 토큰이 아직 유효한지 확인한다. (requireAdmin을 통과했다면 유효) */
const verify = (req, res) => res.status(200).json({ success: true });

module.exports = { login, verify };
