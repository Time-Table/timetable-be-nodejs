const moment = require("moment-timezone");
const Event = require("../models/Event");
const Table = require("../models/Table");
const User = require("../models/User");
const Experiment = require("../models/Experiment");
const { TIMEZONE } = require("../utils/constants");
const { LANDING_AB, landingVariantFor } = require("../utils/landingExperiment");
const { wilson, newcombe, srmPValue, verdictFor, VERDICT_RULE } = require("../utils/abStats");
const { deadlineFor } = require("./participationReportService");

/**
 * 매니저 페이지 랜딩 A/B 결과(2026-09-29). 설계: 하네스 specs/landing-ab-manager.md.
 * 서버에 이미 쌓이는 이벤트를 visitorId 해시로 v1·v2에 나눈다. 순서·같은 세션은 보지 않는다(기존 퍼널과 같은 규칙).
 */
const DEVICES = ["all", "desktop", "mobile"];

// path: undefined면 경로 무관, null이면 경로 없는 기록만, 문자열이면 그 경로만.
const STEPS = [
  { key: "landing_view", event: "landing_view", label: "랜딩 방문" },
  { key: "create_view", event: "create_view", path: "landing", label: "생성 폼 표시" },
  { key: "create_cta_click", event: "create_cta_click", path: "landing", label: "만들기 클릭" },
  { key: "create_submit", event: "create_submit", path: "landing", label: "생성 요청" },
  { key: "create_success", event: "create_success", path: "landing", label: "랜딩 폼 생성 성공" },
  { key: "invite_share", event: "invite_share", label: "공유·복사 시도" },
];
const EXTRA_STEPS = [
  { key: "create_success_quick", event: "create_success", path: "quick_create", label: "빠른 생성 성공" },
  { key: "create_success_unknown", event: "create_success", path: null, label: "경로 없는 생성 성공" },
];
const EVENT_NAMES = [...new Set([...STEPS, ...EXTRA_STEPS].map((s) => s.event))];

const matches = (step, e) =>
  e.name === step.event &&
  (step.path === undefined || (step.path === null ? !e.creationPath : e.creationPath === step.path));

const percent = (value) => (value === null || value === undefined ? null : Math.round(value * 1000) / 10);
const kst = (date) => (date ? moment(date).tz(TIMEZONE).format() : null);

/** 표 모음의 생성 수·마감된 수·마감까지 서로 다른 이름 3명 이상 등록한 수. 3인 참여 달성률과 같은 규칙이다. */
const summarizeTables = async (tableIds, now) => {
  if (!tableIds.length) return { created: 0, closed: 0, reachedThree: 0 };
  const tables = await Table.find({ tableId: { $in: tableIds } })
    .select("tableId dates endHour createdAt -_id").maxTimeMS(2000).lean();
  const closed = tables
    .map((table) => ({ ...table, deadlineAt: deadlineFor(table) }))
    .filter((table) => table.deadlineAt && table.deadlineAt <= now);
  const closedIds = new Set(closed.map((table) => table.tableId));
  const rows = closed.length ? await User.aggregate([
    { $match: {
      name: { $type: "string", $ne: "" },
      $or: closed.map((table) => ({
        tableId: table.tableId,
        createdAt: { $type: "date", $gte: table.createdAt, $lte: table.deadlineAt },
      })),
    } },
    { $group: { _id: { tableId: "$tableId", name: "$name" } } },
    { $group: { _id: "$_id.tableId", count: { $sum: 1 } } },
  ]).option({ maxTimeMS: 2000 }) : [];
  return {
    created: tables.length,
    closed: closed.length,
    reachedThree: rows.filter((row) => closedIds.has(row._id) && row.count >= 3).length,
  };
};

const getLandingAbReport = async ({ device = "all", now = new Date() } = {}) => {
  const deviceFilter = DEVICES.includes(device) ? device : "all";
  const startAt = new Date(LANDING_AB.startAt);
  const state = await Experiment.findOne({ key: LANDING_AB.key }).lean();
  const stoppedAt = state?.stoppedAt || null;
  const endAt = stoppedAt && stoppedAt < now ? stoppedAt : now;

  // 시각(createdAt)으로 거른다. 날짜로 거르면 배포 전 같은 날 옛 랜딩 방문이 섞인다.
  const events = await Event.find({ createdAt: { $gte: startAt, $lt: endAt }, name: { $in: EVENT_NAMES } })
    .select("name visitorId tableId device creationPath createdAt -_id")
    .sort({ createdAt: 1 })
    .maxTimeMS(2000)
    .lean();

  const excluded = new Set(LANDING_AB.testVisitorIds);
  const visitors = new Map();
  for (const e of events) {
    if (typeof e.visitorId !== "string" || excluded.has(e.visitorId)) continue;
    const row = visitors.get(e.visitorId) || { first: null, events: [] };
    if (e.name === "landing_view" && !row.first) row.first = e;
    row.events.push(e);
    visitors.set(e.visitorId, row);
  }

  const emptySide = () => ({ exposed: 0, counts: {}, landingTables: new Set(), quickTables: new Set() });
  const sides = { v1: emptySide(), v2: emptySide() };
  const daily = new Map();
  for (const [visitorId, row] of visitors) {
    // 노출 = 기간 안 landing_view가 있는 브라우저. 기기는 그 브라우저의 첫 landing_view 기기다.
    if (!row.first) continue;
    if (deviceFilter !== "all" && row.first.device !== deviceFilter) continue;
    const variant = landingVariantFor(visitorId);
    const side = sides[variant];
    side.exposed += 1;
    for (const step of [...STEPS, ...EXTRA_STEPS]) {
      if (row.events.some((e) => matches(step, e))) side.counts[step.key] = (side.counts[step.key] || 0) + 1;
    }
    for (const e of row.events) {
      if (e.name !== "create_success" || !e.tableId) continue;
      if (e.creationPath === "landing") side.landingTables.add(e.tableId);
      if (e.creationPath === "quick_create") side.quickTables.add(e.tableId);
    }
    const day = moment(row.first.createdAt).tz(TIMEZONE).format("YYYY-MM-DD");
    const dayRow = daily.get(day) || { date: day, v1: 0, v2: 0 };
    dayRow[variant] += 1;
    daily.set(day, dayRow);
  }

  const variants = {};
  for (const variant of ["v1", "v2"]) {
    const side = sides[variant];
    const stepRow = (step) => {
      const count = side.counts[step.key] || 0;
      return { key: step.key, event: step.event, label: step.label, count, rate: side.exposed ? percent(count / side.exposed) : null };
    };
    const success = side.counts.create_success || 0;
    const ci = wilson(success, side.exposed);
    variants[variant] = {
      exposed: side.exposed,
      steps: STEPS.map(stepRow),
      extraSteps: EXTRA_STEPS.map(stepRow),
      primary: {
        count: success,
        rate: side.exposed ? percent(success / side.exposed) : null,
        ci95: ci ? ci.map(percent) : null,
      },
      tables: {
        landing: await summarizeTables([...side.landingTables], now),
        quickCreate: await summarizeTables([...side.quickTables], now),
      },
    };
  }

  const diff = newcombe(variants.v1.primary.count, variants.v1.exposed, variants.v2.primary.count, variants.v2.exposed);
  const srm = srmPValue(variants.v1.exposed, variants.v2.exposed, LANDING_AB.v2Percent / 100);
  const verdict = verdictFor({
    srm,
    v1: { exposed: variants.v1.exposed, success: variants.v1.primary.count },
    v2: { exposed: variants.v2.exposed, success: variants.v2.primary.count },
    difference: diff,
  });

  // 배포 시각 점검: 새 FE는 랜딩을 그릴 때마다 create_view에 creationPath를 붙인다.
  // 가장 이른 그 기록이 startAt보다 10분 넘게 앞서면 startAt을 늦게 적은 것이다.
  const first = await Event.findOne({ name: "create_view", creationPath: "landing" })
    .sort({ createdAt: 1 }).select("createdAt -_id").lean();
  const firstTrackedAt = first?.createdAt || null;

  return {
    experiment: {
      key: LANDING_AB.key,
      plannedStartDate: LANDING_AB.plannedStartDate,
      startAt: kst(startAt),
      stoppedAt: kst(stoppedAt),
      v2Percent: LANDING_AB.v2Percent,
      asOf: kst(now),
      day: Math.max(1, Math.floor((endAt - startAt) / 86400000) + 1),
      phase: stoppedAt ? "stopped" : "running",
      rule: VERDICT_RULE,
      excludedVisitors: LANDING_AB.testVisitorIds.length,
      firstTrackedAt: kst(firstTrackedAt),
      startAtWarning: Boolean(firstTrackedAt && firstTrackedAt < new Date(+startAt - 10 * 60 * 1000)),
    },
    device: deviceFilter,
    assignment: {
      v1: variants.v1.exposed,
      v2: variants.v2.exposed,
      expectedV2Share: LANDING_AB.v2Percent,
      srmPValue: srm === null ? null : Math.round(srm * 10000) / 10000,
    },
    variants,
    difference: diff ? { primaryPoints: percent(diff.diff), ci95: diff.ci.map(percent) } : null,
    verdict,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/**
 * 중단. 처음 한 번만 stoppedAt을 적는다. 이미 중단했으면 바꾸지 않고 conflict를 돌려준다. 되돌리기는 없다.
 */
const stopLandingAb = async (now = new Date()) => {
  const existing = await Experiment.findOne({ key: LANDING_AB.key }).lean();
  if (existing?.stoppedAt) return { conflict: true, stoppedAt: kst(existing.stoppedAt) };
  try {
    await Experiment.findOneAndUpdate(
      { key: LANDING_AB.key, stoppedAt: { $exists: false } },
      { $set: { stoppedAt: now } },
      { upsert: true, new: true }
    );
  } catch (err) {
    // 거의 같은 때에 두 번 누르면 두 번째는 고유 키 충돌로 끝난다.
    if (err?.code === 11000) {
      const again = await Experiment.findOne({ key: LANDING_AB.key }).lean();
      return { conflict: true, stoppedAt: kst(again?.stoppedAt) };
    }
    throw err;
  }
  return { conflict: false, report: await getLandingAbReport({ now }) };
};

module.exports = { getLandingAbReport, stopLandingAb, STEPS, EXTRA_STEPS };
