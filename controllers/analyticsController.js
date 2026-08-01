const analyticsService = require("../services/analyticsService");
const Sentry = require("@sentry/node");

/** 컨트롤러마다 반복되는 try/catch를 한 번만 쓴다. */
const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    if (data === null) {
      return res.status(404).json({ success: false, message: "찾을 수 없습니다." });
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

const getTrends = handle((req) => analyticsService.getTrends(Number(req.query.days) || 30));

const getAudience = handle((req) => analyticsService.getAudience(Number(req.query.days) || 0));

const getChatFeed = handle((req) =>
  analyticsService.getChatFeed(Math.min(Number(req.query.limit) || 100, 300)),
);

const getTableDetail = handle((req) => analyticsService.getTableDetail(req.params.tableId));

module.exports = { getTrends, getAudience, getChatFeed, getTableDetail };
