const Sentry = require("@sentry/node");
const tableAbService = require("../services/tableAbService");

/** 공개: 표 화면 A/B 2회차 상태(꺼짐·진행·중단). FE가 표 화면을 열 때 읽는다. 캐시하지 않는다. */
const getState = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const data = await tableAbService.getState();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

/** 관리자: 결과. */
const getReport = async (req, res) => {
  try {
    const data = await tableAbService.getReport();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

/** 관리자: [시작]. 처음 한 번만 되고, 이미 시작했으면 409와 지금 상태. */
const start = async (req, res) => {
  try {
    const result = await tableAbService.start();
    if (result.conflict) return res.status(409).json({ success: false, message: "이미 시작한 실험입니다.", data: result.state });
    return res.status(200).json({ success: true, data: result.state });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

/** 관리자: [중단]. 시작한 뒤 처음 한 번만 되고, 시작 전·이미 중단이면 409와 지금 상태. */
const stop = async (req, res) => {
  try {
    const result = await tableAbService.stop();
    if (result.conflict) return res.status(409).json({ success: false, message: "시작하지 않았거나 이미 중단한 실험입니다.", data: result.state });
    return res.status(200).json({ success: true, data: result.state });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

module.exports = { getState, getReport, start, stop };
