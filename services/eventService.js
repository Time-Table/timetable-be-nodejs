const Event = require("../models/Event");
const Table = require("../models/Table");
const User = require("../models/User");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");
const { EVENTS, EVENT_NAMES, FUNNELS, MATURITY_FUNNEL } = require("../utils/funnels");

const TABLE_EVENTS = [EVENTS.CREATE_SUCCESS, EVENTS.INVITE_SHARE, EVENTS.TABLE_VIEW,
  EVENTS.JOIN_SUBMIT, EVENTS.JOIN_SUCCESS, EVENTS.SCHEDULE_SAVE, EVENTS.RANKING_OPEN];

const resolveTableRole = async (tableId, visitorId) => {
  if (!tableId) return "unknown";
  try {
    const table = await Table.findOne({ tableId }).select("+creatorVisitorId").lean();
    if (!table?.creatorVisitorId) return "unknown";
    return table.creatorVisitorId === visitorId ? "creator" : "participant";
  } catch {
    // 역할 조회 장애로 기존 이벤트까지 유실시키지 않는다.
    return "unknown";
  }
};

const recordEvent = async ({ name, visitorId, tableId, source, device }) => {
  // 정의되지 않은 이름은 저장하지 않는다. 오타나 외부 호출로 컬렉션이 오염되는 것을 막는다.
  if (!EVENT_NAMES.includes(name) || typeof visitorId !== "string" ||
    visitorId.length === 0 || visitorId.length > 64) return null;

  const validTableId = typeof tableId === "string" && tableId.length > 0 && tableId.length <= 64
    ? tableId : undefined;
  const tableRole = TABLE_EVENTS.includes(name)
    ? await resolveTableRole(validTableId, visitorId) : undefined;

  return await Event.create({
    name,
    visitorId,
    tableId: validTableId,
    tableRole,
    source: typeof source === "string" ? source.slice(0, 100) : undefined,
    device: ["mobile", "tablet", "desktop"].includes(device) ? device : undefined,
    date: moment().tz(TIMEZONE).format("YYYY-MM-DD"),
  });
};

const percent = (value, base) => (base > 0 ? Number(((value / base) * 100).toFixed(1)) : 0);

/**
 * 기간의 시작 날짜(KST, YYYY-MM-DD). days가 없으면 전체 기간을 뜻하는 null을 돌려준다.
 */
const startDateOf = (days) =>
  days > 0
    ? moment()
        .tz(TIMEZONE)
        .subtract(days - 1, "days")
        .format("YYYY-MM-DD")
    : null;

/**
 * 이벤트 기반 퍼널. 기간 내 앞 단계 이벤트가 모두 있는 방문자만 센다.
 * 세션 및 발생 순서를 검사하지 않는 방문자 집계다.
 * reached는 앞 단계와 무관하게 그 이벤트를 발생시킨 방문자 수로,
 * completed와 크게 벌어지면 계측이 빠졌거나 중간 진입이 많다는 신호다.
 */
const buildEventFunnels = (visitorEventSets) => {
  return FUNNELS.map((funnel) => {
    let previous = 0;
    const steps = funnel.steps.map((step, index) => {
      const required = funnel.steps.slice(0, index + 1).map((s) => s.event);
      const completed = visitorEventSets.filter((events) =>
        required.every((name) => events.has(name)),
      ).length;
      const reached = visitorEventSets.filter((events) => events.has(step.event)).length;

      const result = {
        ...step,
        completed,
        reached,
        conversionFromPrev: index === 0 ? 100 : percent(completed, previous),
        dropFromPrev: index === 0 ? 0 : Math.max(previous - completed, 0),
      };
      previous = completed;
      return result;
    });

    const entered = steps[0]?.completed || 0;
    const finished = steps[steps.length - 1]?.completed || 0;

    return {
      ...funnel,
      steps: steps.map((step) => ({
        ...step,
        conversionFromStart: percent(step.completed, entered),
      })),
      entered,
      finished,
      overallConversion: percent(finished, entered),
    };
  });
};

/**
 * 테이블 성숙도 퍼널. 이벤트가 아니라 Table/User 컬렉션에서 직접 계산하므로
 * 이벤트 수집을 붙이기 전에 만들어진 테이블도 그대로 집계된다.
 */
const buildMaturityFunnel = async (startDate) => {
  const tableQuery = startDate
    ? { createdAt: { $gte: moment.tz(startDate, TIMEZONE).startOf("day").toDate() } }
    : {};

  const tables = await Table.find(tableQuery, "tableId").lean();
  const tableIds = tables.map((t) => t.tableId);

  const grouped = await User.aggregate([
    { $match: { tableId: { $in: tableIds } } },
    { $group: { _id: "$tableId", count: { $sum: 1 } } },
  ]);

  const countsByTable = new Map(grouped.map((g) => [g._id, g.count]));
  const participantCounts = tableIds.map((id) => countsByTable.get(id) || 0);

  let previous = 0;
  const steps = MATURITY_FUNNEL.steps.map((step, index) => {
    const completed = participantCounts.filter((count) => count >= step.threshold).length;
    const result = {
      ...step,
      completed,
      reached: completed,
      conversionFromPrev: index === 0 ? 100 : percent(completed, previous),
      dropFromPrev: index === 0 ? 0 : Math.max(previous - completed, 0),
    };
    previous = completed;
    return result;
  });

  const entered = steps[0]?.completed || 0;
  const finished = steps[steps.length - 1]?.completed || 0;

  return {
    ...MATURITY_FUNNEL,
    steps: steps.map((step) => ({
      ...step,
      conversionFromStart: percent(step.completed, entered),
    })),
    entered,
    finished,
    overallConversion: percent(finished, entered),
    averageParticipants: participantCounts.length
      ? Number(
          (participantCounts.reduce((a, b) => a + b, 0) / participantCounts.length).toFixed(1),
        )
      : 0,
  };
};

const getFunnelReport = async (days) => {
  const startDate = startDateOf(days);
  const match = startDate ? { date: { $gte: startDate } } : {};

  const grouped = await Event.aggregate([
    { $match: match },
    { $group: { _id: "$visitorId", events: { $addToSet: "$name" } } },
  ]);

  const visitorEventSets = grouped.map((g) => new Set(g.events));
  const maturity = await buildMaturityFunnel(startDate);

  return {
    days: days > 0 ? days : null,
    startDate,
    visitors: visitorEventSets.length,
    funnels: [...buildEventFunnels(visitorEventSets), maturity],
  };
};

module.exports = { recordEvent, getFunnelReport };
