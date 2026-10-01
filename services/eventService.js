const Event = require("../models/Event");
const Table = require("../models/Table");
const User = require("../models/User");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");
const { EVENTS, EVENT_NAMES, FUNNELS, MATURITY_FUNNEL } = require("../utils/funnels");

// 표에서 일어난 이벤트. 그때 보던 화면(uiVersion A/B)을 둘 수 있다.
const TABLE_EVENTS = [EVENTS.CREATE_SUCCESS, EVENTS.INVITE_SHARE, EVENTS.TABLE_VIEW,
  EVENTS.JOIN_SUBMIT, EVENTS.JOIN_SUCCESS, EVENTS.SCHEDULE_SAVE, EVENTS.RANKING_OPEN, EVENTS.UI_SWITCH,
  EVENTS.UI_VIEW, EVENTS.AB_STATE_FAIL, EVENTS.JOIN_FAIL, EVENTS.SAVE_FAIL,
  EVENTS.UI_LOAD_FAIL];
// 만든 사람·참여자 구분은 원래 표 이벤트에만 붙인다(2회차 기록은 자주 와서 조회를 늘리지 않는다).
const ROLE_EVENTS = [EVENTS.CREATE_SUCCESS, EVENTS.INVITE_SHARE, EVENTS.TABLE_VIEW,
  EVENTS.JOIN_SUBMIT, EVENTS.JOIN_SUCCESS, EVENTS.SCHEDULE_SAVE, EVENTS.RANKING_OPEN, EVENTS.UI_SWITCH];
const UI_VERSIONS = ["A", "B"];

/**
 * 표 화면 A/B 2회차(2026-10-01, 하네스 specs/table-ab-2.md) 기록. 정해진 필드만 받고, 자유 문자열(source)은 버린다.
 * needsUi: 그때 화면(A/B)이 있어야 저장. needsView: 화면 구간 ID가 있어야 저장. reasons: 이유 값(없으면 이유를 받지 않음).
 */
const AB_RULES = {
  [EVENTS.UI_VIEW]: { needsUi: true, needsView: true },
  [EVENTS.AB_STATE_FAIL]: { reasons: ["timeout", "error"] },
  [EVENTS.JOIN_FAIL]: { needsUi: true, reasons: ["invalid_input", "wrong_password", "rate_limited", "network", "server"] },
  [EVENTS.SAVE_FAIL]: { needsUi: true, reasons: ["network", "server", "rejected"] },
  [EVENTS.UI_LOAD_FAIL]: { needsUi: true, reasons: ["chunk_retry", "chunk_failed"] },
};
const ID_PATTERN = /^[A-Za-z0-9-]{1,40}$/;
const cleanId = (value) => (typeof value === "string" && ID_PATTERN.test(value) ? value : undefined);
const cleanInt = (value, max) => (Number.isInteger(value) && value >= 0 && value <= max ? value : undefined);

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

const CREATION_EVENTS = [EVENTS.CREATE_VIEW, EVENTS.CREATE_CTA_CLICK, EVENTS.CREATE_SUBMIT, EVENTS.CREATE_SUCCESS];
const CREATION_PATHS = ["landing", "quick_create"];

const recordEvent = async ({ name, visitorId, tableId, source, device, creationPath, uiVersion,
  viewId, tabId, seq, reason, joinType }) => {
  // 정의되지 않은 이름은 저장하지 않는다. 오타나 외부 호출로 컬렉션이 오염되는 것을 막는다.
  if (!EVENT_NAMES.includes(name) || typeof visitorId !== "string" ||
    visitorId.length === 0 || visitorId.length > 64) return null;

  const validTableId = typeof tableId === "string" && tableId.length > 0 && tableId.length <= 64
    ? tableId : undefined;
  // 테이블 A/B: 표 이벤트에서 A·B만 받는다. 전환 기록은 어느 표에서 어느 화면으로 바꿨는지 없으면 쓸모가 없어 버린다.
  const validUiVersion = TABLE_EVENTS.includes(name) && UI_VERSIONS.includes(uiVersion) ? uiVersion : undefined;
  if (name === EVENTS.UI_SWITCH && (!validTableId || !validUiVersion)) return null;

  // 2회차 기록: 표가 있어야 하고, 이름마다 정한 조건을 못 채우면 버린다.
  const rule = AB_RULES[name];
  const isAb = Boolean(rule) || name === EVENTS.UI_SWITCH;
  const validViewId = isAb ? cleanId(viewId) : undefined;
  const validReason = rule?.reasons?.includes(reason) ? reason : undefined;
  if (rule) {
    if (!validTableId) return null;
    if (rule.needsUi && !validUiVersion) return null;
    if (rule.needsView && !validViewId) return null;
    if (rule.reasons && !validReason) return null;
  }

  const tableRole = ROLE_EVENTS.includes(name)
    ? await resolveTableRole(validTableId, visitorId) : undefined;

  return await Event.create({
    name,
    visitorId,
    tableId: validTableId,
    tableRole,
    // 2회차 기록에는 자유 문자열을 두지 않는다(사생활, Codex 2026-10-01).
    source: !rule && typeof source === "string" ? source.slice(0, 100) : undefined,
    device: ["mobile", "tablet", "desktop"].includes(device) ? device : undefined,
    // 생성 퍼널 이벤트에만 둔다. 다른 이벤트에 붙어 오거나 모르는 값이면 버린다.
    creationPath: CREATION_EVENTS.includes(name) && CREATION_PATHS.includes(creationPath) ? creationPath : undefined,
    uiVersion: validUiVersion,
    viewId: validViewId,
    tabId: isAb ? cleanId(tabId) : undefined,
    seq: isAb ? cleanInt(seq, 1e6) : undefined,
    reason: validReason,
    joinType: name === EVENTS.JOIN_SUCCESS && ["new", "returning"].includes(joinType) ? joinType : undefined,
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
