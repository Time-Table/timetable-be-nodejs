const BlogView = require("../models/BlogView");
const Event = require("../models/Event");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");
const { EVENTS } = require("../utils/funnels");

const DEVICES = ["mobile", "tablet", "desktop"];

const recordView = async ({ slug, visitorId, source, device }) => {
  return await BlogView.create({
    slug,
    visitorId,
    source: typeof source === "string" ? source.slice(0, 100) : undefined,
    device: DEVICES.includes(device) ? device : undefined,
    date: moment().tz(TIMEZONE).format("YYYY-MM-DD"),
  });
};

const dayString = (m) => m.format("YYYY-MM-DD");
const percent = (value, base) => (base > 0 ? Number(((value / base) * 100).toFixed(1)) : 0);

/** 시작일부터 종료일까지 하루도 빠짐없이 날짜 문자열을 만든다. */
const dateRange = (startDate, endDate) => {
  const dates = [];
  const cursor = moment.tz(startDate, TIMEZONE);
  const last = moment.tz(endDate, TIMEZONE);
  while (cursor.isSameOrBefore(last)) {
    dates.push(dayString(cursor));
    cursor.add(1, "day");
  }
  return dates;
};

const UNKNOWN_SOURCE = "(알 수 없음)";

/**
 * 순수 조립. DB 집계 결과를 받아 응답 모양을 만든다. DB 없이 테스트한다.
 *
 * - postRows:   [{ slug, views, visitors, lastViewedAt }]  (정렬 전)
 * - visitorCount: 기간 내 visitorId 고유 수
 * - dateRows:   [{ date, views }]  (기록이 있는 날만)
 * - sourceRows: [{ source, count }]  (방문자당 first-touch 출처 기준)
 * - reachedLanding / createdTable: 블로그 방문자 ∩ 이벤트 방문자 수
 * - startDate: 기간 시작(YYYY-MM-DD) 또는 null(전체)
 * - endDate:   오늘(YYYY-MM-DD)
 * - firstDate: 전체 기간일 때 series 시작으로 쓸 가장 오래된 기록 날짜 또는 null
 *
 * views는 히트 수, visitors는 visitorId 고유 수다. 새로고침은 views만 올린다.
 */
const assemble = ({
  postRows,
  visitorCount,
  dateRows,
  sourceRows,
  reachedLanding,
  createdTable,
  startDate,
  endDate,
  firstDate,
}) => {
  const posts = postRows
    .map((row) => ({
      slug: row.slug,
      views: row.views,
      visitors: row.visitors,
      lastViewedAt: row.lastViewedAt || null,
    }))
    .sort((a, b) => b.views - a.views || a.slug.localeCompare(b.slug));

  const totalViews = posts.reduce((acc, post) => acc + post.views, 0);

  const sources = sourceRows
    .map((row) => ({
      label: row.source || UNKNOWN_SOURCE,
      count: row.count,
      percent: percent(row.count, visitorCount),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // 데이터가 없는 날도 0으로 채워야 선 그래프가 실제 모양을 보여준다.
  // 전체 기간이면 첫 기록일부터, 기록이 하나도 없으면 빈 배열이다.
  const byDate = new Map(dateRows.map((row) => [row.date, row.views]));
  const seriesStart = startDate || firstDate;
  const series = seriesStart
    ? dateRange(seriesStart, endDate).map((date) => ({ date, views: byDate.get(date) || 0 }))
    : [];

  return {
    total: { views: totalViews, visitors: visitorCount },
    posts,
    sources,
    series,
    conversion: {
      blogVisitors: visitorCount,
      reachedLanding,
      createdTable,
      reachedLandingPercent: percent(reachedLanding, visitorCount),
      createdTablePercent: percent(createdTable, visitorCount),
    },
  };
};

/**
 * 블로그를 본 **뒤에** 서비스에 온 방문자 수. 이름별({ landing_view: n, create_success: n })로 돌려준다.
 *
 * "블로그에서 들어오는 유저"는 순서가 있어야 한다. 서비스를 먼저 쓰다가 나중에 블로그를 읽은 사람을
 * 세면 유입이 아니다. 그래서 방문자마다 그 이벤트의 마지막 시각을 구하고, 그보다 앞선 블로그 조회가
 * 하나라도 있는 방문자만 센다(첫 블로그 조회 < 마지막 이벤트).
 *
 * Event(TTL 180일)를 바깥 축으로 돌고 BlogView는 visitorId 인덱스로 $lookup 하므로,
 * 누적 BlogView 크기와 무관하게 비용이 이벤트 방문자 수에 비례한다.
 */
const countVisitorsWhoCameAfterBlog = async (match) => {
  const rows = await Event.aggregate([
    { $match: { ...match, name: { $in: [EVENTS.LANDING_VIEW, EVENTS.CREATE_SUCCESS] } } },
    { $group: { _id: { visitorId: "$visitorId", name: "$name" }, lastAt: { $max: "$createdAt" } } },
    {
      $lookup: {
        from: BlogView.collection.name,
        let: { visitorId: "$_id.visitorId", lastAt: "$lastAt" },
        pipeline: [
          {
            $match: {
              ...match,
              $expr: {
                $and: [{ $eq: ["$visitorId", "$$visitorId"] }, { $lt: ["$createdAt", "$$lastAt"] }],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "blogBefore",
      },
    },
    { $match: { blogBefore: { $ne: [] } } },
    { $group: { _id: "$_id.name", count: { $sum: 1 } } },
  ]);
  const byName = new Map(rows.map((r) => [r._id, r.count]));
  return {
    reachedLanding: byName.get(EVENTS.LANDING_VIEW) || 0,
    createdTable: byName.get(EVENTS.CREATE_SUCCESS) || 0,
  };
};

/**
 * 기간별 블로그 통계. days가 0이면 전체 기간.
 *
 * 조회 원본을 메모리에 올리지 않는다. BlogView는 TTL이 없어 해가 갈수록 커지므로
 * 글별·날짜별·출처별 집계는 전부 DB 파이프라인으로 하고, 결과(글 수·날짜 수·출처 수만큼)만 받는다.
 *
 * 전환은 "블로그를 본 뒤 서비스에 온 방문자"다. countVisitorsWhoCameAfterBlog 참조.
 * Event가 TTL 180일이라 전체 기간이어도 최근 180일의 이벤트로만 계산된다.
 */
const getStats = async (days) => {
  const today = moment().tz(TIMEZONE);
  const span = days > 0 ? days : 0;
  const startDate = span > 0 ? dayString(moment(today).subtract(span - 1, "days")) : null;
  const match = startDate ? { date: { $gte: startDate } } : {};

  const [postRows, visitorRows, dateRows, sourceRows, firstDoc] = await Promise.all([
    BlogView.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$slug",
          views: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
          lastViewedAt: { $max: "$createdAt" },
        },
      },
      { $project: { _id: 0, slug: "$_id", views: 1, visitors: { $size: "$visitors" }, lastViewedAt: 1 } },
    ]).allowDiskUse(true),
    BlogView.aggregate([{ $match: match }, { $group: { _id: "$visitorId" } }, { $count: "count" }]).allowDiskUse(
      true,
    ),
    BlogView.aggregate([
      { $match: match },
      { $group: { _id: "$date", views: { $sum: 1 } } },
      { $project: { _id: 0, date: "$_id", views: 1 } },
    ]),
    // 출처는 방문자당 하나. 가장 먼저 기록된 값을 쓴다(first-touch).
    BlogView.aggregate([
      { $match: match },
      { $sort: { createdAt: 1 } },
      { $group: { _id: "$visitorId", source: { $first: "$source" } } },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $project: { _id: 0, source: "$_id", count: 1 } },
    ]).allowDiskUse(true),
    startDate ? null : BlogView.findOne({}, "date").sort({ date: 1 }).lean(),
  ]);

  const visitorCount = visitorRows[0]?.count || 0;

  const { reachedLanding, createdTable } =
    visitorCount > 0 ? await countVisitorsWhoCameAfterBlog(match) : { reachedLanding: 0, createdTable: 0 };

  return {
    days: span || null,
    startDate,
    ...assemble({
      postRows,
      visitorCount,
      dateRows,
      sourceRows,
      reachedLanding,
      createdTable,
      startDate,
      endDate: dayString(today),
      firstDate: firstDoc?.date || null,
    }),
  };
};

module.exports = { recordView, getStats, assemble };
