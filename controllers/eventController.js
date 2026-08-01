const eventService = require("../services/eventService");
const Sentry = require("@sentry/node");

const trackEvent = async (req, res) => {
  const { name, visitorId, tableId, source, device } = req.body;

  // 관리자 브라우저의 행동은 퍼널 집계에서 제외한다.
  if (req.isAdmin) {
    return res.status(200).json({ success: true, skipped: true });
  }

  try {
    await eventService.recordEvent({ name, visitorId, tableId, source, device });
    return res.status(200).json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

const getFunnels = async (req, res) => {
  // days를 넘기지 않거나 0이면 전체 기간
  const days = Number(req.query.days) || 0;

  try {
    const report = await eventService.getFunnelReport(days);
    return res.status(200).json({ success: true, data: report });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

module.exports = { trackEvent, getFunnels };
