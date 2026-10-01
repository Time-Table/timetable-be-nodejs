const experimentService = require("../services/experimentService");
const Sentry = require("@sentry/node");

/** 매니저 페이지 랜딩 A/B 결과. device: all|desktop|mobile(그 밖의 값은 all). */
const getLandingAb = async (req, res) => {
  try {
    const data = await experimentService.getLandingAbReport({ device: req.query.device });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

/** 랜딩 A/B 중단. 처음 한 번만 되고, 이미 중단했으면 409와 그때 시각을 돌려준다. */
const stopLandingAb = async (req, res) => {
  try {
    const result = await experimentService.stopLandingAb();
    if (result.conflict) {
      return res.status(409).json({ success: false, message: "이미 중단한 실험입니다.", stoppedAt: result.stoppedAt });
    }
    return res.status(200).json({ success: true, data: result.report });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

module.exports = { getLandingAb, stopLandingAb };
