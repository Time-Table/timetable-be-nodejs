const Visiter = require("../models/Visiter");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");

/**
 * 랜딩 신뢰 표시용 공개 집계(2026-10-04 사람 지시: "BE 하루 집계 API도 만들어서 연결해").
 * 어제까지 30일 동안의 참여 등록 건수(날짜별 카운터 Visiter.todaySignUp의 합)를 돌려준다.
 * 오늘을 빼고 어제까지로 자르므로 값은 한국시간 자정에 한 번만 바뀐다. 같은 날 두 번째 요청부터는
 * 메모리에 든 값을 돌려줘 DB를 하루 한 번만 읽는다(인스턴스마다).
 */
const WINDOW_DAYS = 30;
const dayString = (m) => m.format("YYYY-MM-DD");

/** 오늘(YYYY-MM-DD, 한국시간)을 받아 어제까지 30일 창을 돌려준다. 끝날(asOf)이 어제다. */
const windowEndingYesterday = (today) => {
  const asOf = dayString(moment.tz(today, TIMEZONE).subtract(1, "day"));
  const startDate = dayString(moment.tz(asOf, TIMEZONE).subtract(WINDOW_DAYS - 1, "days"));
  return { startDate, asOf, days: WINDOW_DAYS };
};

/** 날짜별 카운터 문서 묶음에서 참여 등록 건수를 더한다. 없는 값은 0으로 본다. */
const sumSignUps = (docs) => docs.reduce((acc, doc) => acc + (Number(doc?.todaySignUp) || 0), 0);

let cache = null; // { asOf, value }

const getLandingStats = async ({ today = dayString(moment().tz(TIMEZONE)) } = {}) => {
  const window = windowEndingYesterday(today);
  if (cache && cache.asOf === window.asOf) return cache.value;

  const docs = await Visiter.find({ date: { $gte: window.startDate, $lte: window.asOf } })
    .select("todaySignUp -_id")
    .lean();
  const value = { ...window, count: sumSignUps(docs) };
  // 0은 DB가 비어 답했을 수도 있어 하루 동안 들고 있지 않는다. 다음 요청에서 다시 센다.
  if (value.count > 0) cache = { asOf: window.asOf, value };
  return value;
};

/** 테스트용. 날짜 캐시를 비운다. */
const resetCache = () => {
  cache = null;
};

module.exports = { WINDOW_DAYS, windowEndingYesterday, sumSignUps, getLandingStats, resetCache };
