const eventService = require("../services/eventService");
const Sentry = require("@sentry/node");
const activationReportService = require("../services/activationReportService");
const participationReportService = require("../services/participationReportService");
const { runTelemetry } = require("../utils/telemetry");
const { isBotUserAgent } = require("../utils/botFilter");

/**
 * 페이지가 사라지는 중에 보내는 기록(표 화면 A/B 2회차 ui_load_fail의 chunk_retry)은 미리 묻기 없는 요청이라
 * Content-Type이 text/plain이고 본문은 JSON 문자열이다(eventRoutes가 8KB까지 읽는다). 못 읽으면 빈 기록으로 본다.
 */
const bodyOf = (req) => {
  if (typeof req.body !== "string") return req.body || {};
  try {
    const parsed = JSON.parse(req.body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const trackEvent = async (req, res) => {
  const { name, visitorId, tableId, source, device, creationPath, uiVersion,
    viewId, tabId, seq, reason, joinType } = bodyOf(req);

  // 관리자 브라우저의 행동은 퍼널 집계에서 제외한다. 스스로 봇이라고 밝히는 요청도 같게 다룬다(2026-09-29).
  if (req.isAdmin || isBotUserAgent(req.get("User-Agent"))) {
    return res.status(200).json({ success: true, skipped: true });
  }

  try {
    const event = await eventService.recordEvent({ name, visitorId, tableId, source, device, creationPath, uiVersion,
      viewId, tabId, seq, reason, joinType });
    return res.status(200).json({
      success: true,
      ...(event?.tableRole ? { tableRole: event.tableRole } : {}),
    });
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
    const [metrics, participation] = await Promise.all([
      runTelemetry("activation_report", () => activationReportService.getReport(days), { waitMs: 2000 }),
      runTelemetry("participation_report", () => participationReportService.getReport(days), { waitMs: 5000 }),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        ...report,
        metricsV2: metrics.ok ? metrics.value : { version: 1, status: "unavailable" },
        participationMetrics: participation.ok ? participation.value : { version: 1, status: "unavailable" },
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

module.exports = { trackEvent, getFunnels };
