const landingStatsService = require("../services/landingStatsService");
const Sentry = require("@sentry/node");

/** 랜딩 신뢰 표시용 최근 30일 참여 등록 건수(공개). 하루에 한 번 바뀌는 값이라 한 시간은 그대로 써도 된다. */
const getLandingStats = async (req, res) => {
  try {
    const data = await landingStatsService.getLandingStats();
    res.set("Cache-Control", "public, max-age=3600");
    return res.status(200).json({ success: true, data });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

module.exports = { getLandingStats };
