const Visiter = require("../models/Visiter");
const Event = require("../models/Event");
const Table = require("../models/Table");
const User = require("../models/User");
const DeletedUser = require("../models/DeletedUser");
const Chat = require("../models/Chat");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");

const dayString = (m) => m.format("YYYY-MM-DD");
const percent = (value, base) => (base > 0 ? Number(((value / base) * 100).toFixed(1)) : 0);

/** 시작일부터 오늘까지 하루도 빠짐없이 날짜 문자열을 만든다. */
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

const visitTotal = (doc) =>
  (doc?.todayVisitLandingPage || 0) +
  (doc?.todayVisitCreatePage || 0) +
  (doc?.todayVisitUsePage || 0) +
  (doc?.todayVisitAboutPage || 0);

const sumSeries = (series, key) => series.reduce((acc, row) => acc + row[key], 0);

/**
 * 일별 추이와 직전 동일 기간 대비 증감.
 * 데이터가 없는 날은 0으로 채워야 선 그래프가 실제 모양을 보여준다.
 */
const getTrends = async (days) => {
  const today = moment().tz(TIMEZONE);
  const span = days > 0 ? days : 30;

  const currentStart = dayString(moment(today).subtract(span - 1, "days"));
  const previousStart = dayString(moment(today).subtract(span * 2 - 1, "days"));
  const previousEnd = dayString(moment(today).subtract(span, "days"));

  const docs = await Visiter.find({ date: { $gte: previousStart } }).lean();
  const byDate = new Map(docs.map((d) => [d.date, d]));

  const toSeries = (dates) =>
    dates.map((date) => {
      const doc = byDate.get(date);
      return {
        date,
        visits: visitTotal(doc),
        tables: doc?.todayTableCreateCount || 0,
        signUps: doc?.todaySignUp || 0,
        logins: doc?.todayLogin || 0,
      };
    });

  const current = toSeries(dateRange(currentStart, dayString(today)));
  const previous = toSeries(dateRange(previousStart, previousEnd));

  const metrics = ["visits", "tables", "signUps", "logins"].map((key) => {
    const now = sumSeries(current, key);
    const before = sumSeries(previous, key);
    return {
      key,
      total: now,
      previousTotal: before,
      // 직전 기간이 0이면 증가율은 정의되지 않는다. null로 두고 UI에서 "—"로 표시한다.
      changePercent: before > 0 ? Number((((now - before) / before) * 100).toFixed(1)) : null,
      changeAbsolute: now - before,
    };
  });

  return { days: span, startDate: currentStart, series: current, metrics };
};

/**
 * 기기 구성, 유입 경로, 재방문율, 이탈률.
 * 기기/유입은 방문자(visitorId) 기준 중복 제거로 센다.
 */
const getAudience = async (days) => {
  const today = moment().tz(TIMEZONE);
  const span = days > 0 ? days : 0;
  const startDate = span > 0 ? dayString(moment(today).subtract(span - 1, "days")) : null;
  const match = startDate ? { date: { $gte: startDate } } : {};

  const visitors = await Event.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$visitorId",
        dates: { $addToSet: "$date" },
        devices: { $addToSet: "$device" },
        sources: { $addToSet: "$source" },
      },
    },
  ]);

  const totalVisitors = visitors.length;

  // 한 방문자당 하나로 집계한다. 값이 여러 개면 첫 값을 쓴다.
  const tally = (pick) => {
    const counts = new Map();
    visitors.forEach((v) => {
      const value = pick(v).filter(Boolean)[0] || "(알 수 없음)";
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count, percent: percent(count, totalVisitors) }))
      .sort((a, b) => b.count - a.count);
  };

  const returning = visitors.filter((v) => v.dates.length >= 2).length;

  // 이탈: 참여했다가 스스로 삭제한 사람의 비율
  const userMatch = startDate
    ? { createdAt: { $gte: moment.tz(startDate, TIMEZONE).startOf("day").toDate() } }
    : {};
  const [activeUsers, deletedUsers] = await Promise.all([
    User.countDocuments(userMatch),
    DeletedUser.countDocuments(userMatch),
  ]);

  return {
    days: span || null,
    startDate,
    totalVisitors,
    devices: tally((v) => v.devices),
    sources: tally((v) => v.sources),
    retention: {
      returning,
      once: totalVisitors - returning,
      returningPercent: percent(returning, totalVisitors),
    },
    churn: {
      active: activeUsers,
      deleted: deletedUsers,
      // 전체 참여 시도(현재 남은 사람 + 삭제한 사람) 중 삭제 비율
      deletedPercent: percent(deletedUsers, activeUsers + deletedUsers),
    },
  };
};

/**
 * 채팅 모니터링 피드. 익명 서비스라 스팸/욕설이 들어와도 알 방법이 없어서
 * 최근 메시지를 테이블 제목과 함께 최신순으로 모아 보여준다.
 */
const getChatFeed = async (limit = 100) => {
  const docs = await Chat.find().lean();

  const tableIds = [...new Set(docs.map((d) => d.tableId))];
  const tables = await Table.find({ tableId: { $in: tableIds } }, "tableId title").lean();
  const titleById = new Map(tables.map((t) => [t.tableId, t.title]));

  const messages = docs.flatMap((doc) =>
    (doc.chats || []).map((chat) => ({
      tableId: doc.tableId,
      tableTitle: titleById.get(doc.tableId) || "(삭제된 테이블)",
      name: chat.name,
      message: chat.message,
      timestamp: chat.timestamp,
    })),
  );

  messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    total: messages.length,
    tablesWithChat: docs.length,
    messages: messages.slice(0, limit),
  };
};

/** 테이블 하나의 속사정: 참여자, 이탈자, 채팅량, 시간대별 집중도 */
const getTableDetail = async (tableId) => {
  const table = await Table.findOne({ tableId }).lean();
  if (!table) return null;

  const [participants, deleted, chat] = await Promise.all([
    User.find({ tableId }, "name availableTimes createdAt").lean(),
    DeletedUser.find({ tableId }, "name createdAt").lean(),
    Chat.findOne({ tableId }).lean(),
  ]);

  // 각 시간 셀에 몇 명이 가능한지 세어 상위 구간을 뽑는다.
  const cellCounts = new Map();
  participants.forEach((p) =>
    (p.availableTimes || []).forEach((cell) =>
      cellCounts.set(cell, (cellCounts.get(cell) || 0) + 1),
    ),
  );
  const topSlots = [...cellCounts.entries()]
    .map(([cell, count]) => ({ cell, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    table,
    participants: participants
      .map((p) => ({
        name: p.name,
        slotCount: (p.availableTimes || []).length,
        createdAt: p.createdAt,
      }))
      .sort((a, b) => b.slotCount - a.slotCount),
    deleted: deleted.map((d) => ({ name: d.name, createdAt: d.createdAt })),
    chatCount: chat?.chats?.length || 0,
    topSlots,
  };
};

module.exports = { getTrends, getAudience, getChatFeed, getTableDetail };
