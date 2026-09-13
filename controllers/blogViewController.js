const blogViewService = require("../services/blogViewService");
const Sentry = require("@sentry/node");

const trackView = async (req, res) => {
  // 관리자 브라우저의 조회는 집계에서 제외한다.
  if (req.isAdmin) {
    return res.status(200).json({ success: true, skipped: true });
  }

  const { slug, visitorId, source, device } = req.body;

  try {
    await blogViewService.recordView({ slug, visitorId, source, device });
    return res.status(200).json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

// 기간 상한. series를 날짜 수만큼 만들기 때문에 상한이 없으면 요청 하나로 이벤트 루프를 잡는다.
const MAX_DAYS = 365;

const getStats = async (req, res) => {
  // days를 넘기지 않거나 0이면 전체 기간. 그 외에는 1~365 정수만 받는다.
  // 쿼리 파서가 days[toString]=x 같은 입력을 객체로 만들 수 있으므로 문자열일 때만 숫자로 본다.
  const raw = req.query.days;
  const days =
    raw === undefined || raw === "" ? 0 : typeof raw === "string" && /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(days) || days > MAX_DAYS) {
    return res.status(400).json({ success: false, message: `days는 0 또는 1~${MAX_DAYS} 사이의 정수여야 합니다.` });
  }

  try {
    const data = await blogViewService.getStats(days);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

module.exports = { trackView, getStats };
