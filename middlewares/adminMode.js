/**
 * 매니저 페이지에서 인증한 브라우저는 요청에 X-Admin-Mode 헤더를 붙인다.
 * 이 헤더가 붙은 요청은 방문/생성/가입 통계와 퍼널 이벤트 집계에서 제외한다.
 *
 * 주의: 통계 오염을 막기 위한 장치일 뿐 인증 수단이 아니다.
 * 헤더는 누구나 위조할 수 있으므로 권한 판단에는 절대 쓰지 말 것.
 */
const detectAdminMode = (req, res, next) => {
  req.isAdmin = req.get("X-Admin-Mode") === "true";
  next();
};

module.exports = { detectAdminMode };
