const moment = require("moment-timezone");
const Event = require("../models/Event");
const Table = require("../models/Table");
const User = require("../models/User");
const Experiment = require("../models/Experiment");
const TableActivation = require("../models/TableActivation");
const { TIMEZONE } = require("../utils/constants");
const { TABLE_AB, tableUiFor } = require("../utils/tableExperiment");
const { wilson, srmPValue } = require("../utils/abStats");
const { deadlineFor } = require("./participationReportService");

/**
 * 표 화면 A/B 2회차(2026-10-01). 설계·계산 규칙은 하네스 specs/table-ab-2.md가 정본이다.
 * 단위는 식별된 브라우저(visitorId). 배정은 visitorId 해시, 켜고 끄기는 Experiment 문서의 startedAt·stoppedAt.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SRM_ALPHA = 0.01;
const AMBIGUOUS_MS = 30 * 1000;
const EVENT_NAMES = ["ui_view", "ui_switch", "ab_state_fail", "join_submit", "join_success",
  "join_fail", "schedule_save", "save_fail", "ui_load_fail"];
// 판정 문턱은 [시작] 전에 사람이 정한다(specs/table-ab-2.md). 정하기 전에는 판정하지 않는다.
const RULE = { srmAlpha: SRM_ALPHA, minTriedPerArm: null };

const percent = (value) => (value === null || value === undefined ? null : Math.round(value * 1000) / 10);
const kst = (date) => (date ? moment(date).tz(TIMEZONE).format() : null);
const stateOf = (doc) => (!doc?.startedAt ? "off" : doc.stoppedAt ? "stopped" : "running");

/** 공개 상태. FE가 표 화면을 열 때 읽는다. */
const getState = async () => {
  const doc = await Experiment.findOne({ key: TABLE_AB.key }).maxTimeMS(1000).lean();
  return { key: TABLE_AB.key, state: stateOf(doc), startedAt: kst(doc?.startedAt), stoppedAt: kst(doc?.stoppedAt) };
};

/** [시작]. 처음 한 번만 startedAt을 적는다. 이미 시작했으면 conflict. */
const start = async (now = new Date()) => {
  const existing = await Experiment.findOne({ key: TABLE_AB.key }).lean();
  if (existing?.startedAt) return { conflict: true, state: await getState() };
  try {
    await Experiment.findOneAndUpdate(
      { key: TABLE_AB.key, startedAt: { $exists: false } },
      { $set: { startedAt: now } },
      { upsert: true, new: true },
    );
  } catch (err) {
    // 거의 같은 때 두 번 누르면 두 번째는 고유 키 충돌로 끝난다.
    if (err?.code === 11000) return { conflict: true, state: await getState() };
    throw err;
  }
  return { state: await getState() };
};

/** [중단]. 시작한 뒤 처음 한 번만 stoppedAt을 적는다. 시작 전이거나 이미 중단했으면 conflict. 되돌리기는 없다. */
const stop = async (now = new Date()) => {
  const updated = await Experiment.findOneAndUpdate(
    { key: TABLE_AB.key, startedAt: { $exists: true }, stoppedAt: { $exists: false } },
    { $set: { stoppedAt: now } },
    { new: true },
  ).lean();
  if (!updated) return { conflict: true, state: await getState() };
  return { state: await getState() };
};

/** 마감까지 참여 등록한 서로 다른 이름 수(랜딩 A/B "3인 달성"과 같은 정의). */
const registeredByDeadline = async (tables) => {
  if (!tables.length) return new Map();
  const rows = await User.aggregate([
    { $match: {
      name: { $type: "string", $ne: "" },
      $or: tables.map((table) => ({
        tableId: table.tableId,
        createdAt: { $type: "date", $gte: table.createdAt, $lte: table.deadlineAt },
      })),
    } },
    { $group: { _id: { tableId: "$tableId", name: "$name" } } },
    { $group: { _id: "$_id.tableId", count: { $sum: 1 } } },
  ]).option({ maxTimeMS: 3000 });
  return new Map(rows.map((row) => [row._id, row.count]));
};

/**
 * 어느 시각의 화면 선택 = 그때까지의 선택 기록(본 화면 ui_view·바꾼 화면 ui_switch, 모든 표) 중 마지막 것.
 * 선택은 브라우저에 남아 모든 표에 쓰이므로 표를 가리지 않는다. 같은 탭 안에서는 seq, 탭이 다르면 서버 시각으로 정렬한다.
 * 다른 탭의 마지막 두 기록이 30초 안이고 서로 다르면 순서 불명(ambiguous). 마지막 기록 시각(at)도 돌려준다.
 */
const finalOf = (segments) => {
  if (!segments.length) return null;
  const lastByTab = new Map();
  for (const seg of segments) {
    const key = seg.tabId || "-";
    const prev = lastByTab.get(key);
    const later = !prev || (Number.isInteger(seg.seq) && Number.isInteger(prev.seq)
      ? seg.seq > prev.seq : seg.at > prev.at);
    if (later) lastByTab.set(key, seg);
  }
  const tails = [...lastByTab.values()].sort((a, b) => b.at - a.at);
  if (tails.length > 1 && tails[0].ui !== tails[1].ui && tails[0].at - tails[1].at < AMBIGUOUS_MS) {
    return { ambiguous: true };
  }
  return { ui: tails[0].ui, at: tails[0].at };
};

/** 배정별 "화면을 교체한 사람 중 마감 때 B를 유지한" 비율과 평균(조건부 선호). */
const preferenceOf = (rows) => {
  const side = (arm) => {
    const list = rows.filter((row) => row.assigned === arm && row.switched && row.final);
    const decided = list.filter((row) => !row.final.ambiguous);
    const finalB = decided.filter((row) => row.final.ui === "B").length;
    const n = decided.length;
    const ci = wilson(finalB, n);
    return {
      tried: n, finalB, ambiguous: list.length - n,
      rate: n ? percent(finalB / n) : null, ci95: ci ? ci.map(percent) : null,
    };
  };
  const a = side("A");
  const b = side("B");
  let mean = null;
  let ci95 = null;
  if (a.tried && b.tried) {
    // 평균 구간: 배정별 Wilson 구간을 합친 MOVER(Newcombe 방식). 표본이 적거나 0%·100%여도 폭이 0이 되지 않는다(Codex 2026-10-02).
    const pa = a.finalB / a.tried;
    const pb = b.finalB / b.tried;
    const wa = wilson(a.finalB, a.tried);
    const wb = wilson(b.finalB, b.tried);
    const m = (pa + pb) / 2;
    mean = percent(m);
    ci95 = [
      percent(Math.max(0, m - Math.sqrt((pa - wa[0]) ** 2 + (pb - wb[0]) ** 2) / 2)),
      percent(Math.min(1, m + Math.sqrt((wa[1] - pa) ** 2 + (wb[1] - pb) ** 2) / 2)),
    ];
  }
  return { A: a, B: b, mean, ci95 };
};

/** 판정(구조만 고정, 문턱은 사람이 정함). */
const verdictOf = ({ srm, preference }) => {
  if (srm !== null && srm < RULE.srmAlpha) return "srm_alert";
  if (!RULE.minTriedPerArm) return "rule_pending";
  if (preference.A.tried < RULE.minTriedPerArm || preference.B.tried < RULE.minTriedPerArm || !preference.ci95) return "insufficient";
  if (preference.ci95[0] > 50) return "b_preferred";
  if (preference.ci95[1] < 50) return "a_preferred";
  return "no_difference";
};

const ratio = (count, total) => (total ? percent(count / total) : null);

/** 결과(관리자). 이름·visitorId·표 ID는 담지 않는다. */
const getReport = async (now = new Date()) => {
  const doc = await Experiment.findOne({ key: TABLE_AB.key }).lean();
  const state = stateOf(doc);
  const experiment = {
    key: TABLE_AB.key, state, startedAt: kst(doc?.startedAt), stoppedAt: kst(doc?.stoppedAt), asOf: kst(now),
    maxDeadlineDays: TABLE_AB.maxDeadlineDays, rule: RULE,
  };
  if (state === "off") return { experiment };

  const startAt = doc.startedAt;
  const endAt = doc.stoppedAt && doc.stoppedAt < now ? doc.stoppedAt : now;
  experiment.day = Math.max(1, Math.floor((endAt - startAt) / DAY_MS) + 1);

  const events = await Event.find({ createdAt: { $gte: startAt, $lt: endAt }, name: { $in: EVENT_NAMES } })
    .select("name visitorId tableId uiVersion viewId tabId seq reason joinType createdAt -_id")
    .sort({ createdAt: 1 })
    .maxTimeMS(5000)
    .lean();

  // 브라우저별로 모은다.
  const visitors = new Map();
  const visitorOf = (id) => {
    if (!visitors.has(id)) {
      visitors.set(id, { id, assigned: tableUiFor(id), views: [], marks: [], stateFail: false });
    }
    return visitors.get(id);
  };
  for (const e of events) {
    if (typeof e.visitorId !== "string" || !e.visitorId) continue;
    const v = visitorOf(e.visitorId);
    if (e.name === "ab_state_fail") v.stateFail = true;
    if ((e.name === "ui_view" || e.name === "ui_switch") && e.uiVersion) {
      const mark = { tableId: e.tableId, ui: e.uiVersion, tabId: e.tabId, seq: e.seq, at: +e.createdAt };
      v.marks.push(mark);
      if (e.name === "ui_view") v.views.push(mark);
    }
  }

  // 대상 표: 마감이 지났고 시작 + 150일 안이며, 마감까지 3명 이상 참여 등록.
  const viewedTableIds = [...new Set([...visitors.values()].flatMap((v) => v.views.map((s) => s.tableId)))]
    .filter(Boolean);
  const tableDocs = viewedTableIds.length
    ? await Table.find({ tableId: { $in: viewedTableIds } }).select("tableId dates endHour createdAt -_id").maxTimeMS(3000).lean()
    : [];
  const limit = +startAt + TABLE_AB.maxDeadlineDays * DAY_MS;
  const closed = tableDocs
    .map((table) => ({ ...table, deadlineAt: deadlineFor(table) }))
    // 마감 상한은 집계 끝(중단했으면 중단 시각). 중단 뒤에 마감된 표는 마감 때 선택을 볼 수 없어 넣지 않는다(Codex 2026-10-02).
    .filter((table) => table.deadlineAt && +table.deadlineAt <= +endAt && +table.deadlineAt <= limit);
  const counts = await registeredByDeadline(closed);
  const qualifying = new Map(closed.filter((t) => (counts.get(t.tableId) || 0) >= 3).map((t) => [t.tableId, t]));
  const activations = qualifying.size
    ? await TableActivation.find({ _id: { $in: [...qualifying.keys()] } }).select("scheduleChanged").maxTimeMS(2000).lean()
    : [];
  const changedTables = activations.filter((a) => a.scheduleChanged).length;

  // 브라우저별 마감 때 유지한 화면(대상 표 조건부, 모든 표). 브라우저 한 줄로 센다.
  // - 기준 시각: 그 브라우저가 마감 전에 본 대상 표들 중 가장 늦은 마감(대상 표 조건부), 모든 표 기준은 집계 끝.
  // - 유지한 화면: 기준 시각까지의 마지막 선택(어느 표에서 봤든 바꿨든). 그 표를 다시 열지 않아도 선택은 남아 있다.
  // - 교체한 사람: 기준 시각까지 A·B 두 화면을 모두 실제로 본(ui_view) 사람. 띠로 바꾸지 않으면 배정 화면만 나온다.
  const stateAt = (v, limit) => {
    const final = finalOf(v.marks.filter((m) => m.at < limit));
    const seen = new Set(v.views.filter((s) => s.at < limit).map((s) => s.ui));
    return { final, switched: Boolean(final) && seen.has("A") && seen.has("B") };
  };
  const rows = [];
  for (const v of visitors.values()) {
    if (!v.views.length) continue;
    let cutoff = null;
    for (const s of v.views) {
      const table = qualifying.get(s.tableId);
      if (table && s.at < +table.deadlineAt && (cutoff === null || +table.deadlineAt > cutoff)) cutoff = +table.deadlineAt;
    }
    const inQualifying = cutoff === null ? { final: null, switched: false } : stateAt(v, cutoff);
    const all = stateAt(v, Infinity);
    rows.push({
      assigned: v.assigned,
      switched: inQualifying.switched,
      switchedAll: all.switched,
      final: inQualifying.final,
      finalAll: all.final,
      observedBefore: false,
      id: v.id,
    });
  }

  // 실험 전 기록이 관측된 브라우저(보관 180일 안에서만 보인다).
  const ids = rows.map((row) => row.id);
  const before = ids.length
    ? new Set(await Event.distinct("visitorId", { visitorId: { $in: ids }, createdAt: { $lt: startAt } }).maxTimeMS(3000))
    : new Set();
  for (const row of rows) row.observedBefore = before.has(row.id);

  const exposed = { A: rows.filter((r) => r.assigned === "A").length, B: rows.filter((r) => r.assigned === "B").length };
  const stateFailOnly = { A: 0, B: 0 };
  for (const v of visitors.values()) if (v.stateFail && !v.views.length) stateFailOnly[v.assigned] += 1;
  const srm = srmPValue(exposed.A, exposed.B, TABLE_AB.bPercent / 100);

  const preference = preferenceOf(rows);
  const allTables = preferenceOf(rows.map((r) => ({ ...r, final: r.finalAll, switched: r.switchedAll })));
  const triedShare = {
    A: ratio(rows.filter((r) => r.assigned === "A" && r.switchedAll).length, exposed.A),
    B: ratio(rows.filter((r) => r.assigned === "B" && r.switchedAll).length, exposed.B),
  };
  const byHistory = {
    observed: preferenceOf(rows.filter((r) => r.observedBefore)),
    notObserved: preferenceOf(rows.filter((r) => !r.observedBefore)),
  };

  // 실패(화면 = 그 기록의 uiVersion). 요청 기준과 브라우저 기준을 따로.
  const failures = {};
  const joins = {};
  for (const ui of ["A", "B"]) {
    const of = (name) => events.filter((e) => e.name === name && e.uiVersion === ui);
    const joinFails = of("join_fail");
    const invalid = joinFails.filter((e) => e.reason === "invalid_input").length;
    const serverFails = joinFails.length - invalid;
    const submits = of("join_submit").length;
    const byReason = {};
    for (const e of joinFails) byReason[e.reason] = (byReason[e.reason] || 0) + 1;
    const peopleWith = (names) => new Set(events.filter((e) => names.includes(e.name) && e.uiVersion === ui).map((e) => e.visitorId));
    const joinTried = peopleWith(["join_submit", "join_fail"]);
    const joinFailed = peopleWith(["join_fail"]);
    const saves = of("schedule_save").length;
    const saveFails = of("save_fail").length;
    const saveTried = peopleWith(["schedule_save", "save_fail"]);
    const saveFailed = peopleWith(["save_fail"]);
    failures[ui] = {
      join: {
        requests: submits, failed: serverFails, rate: ratio(serverFails, submits),
        invalidInput: invalid, invalidRate: ratio(invalid, submits + invalid), byReason,
        people: joinTried.size, peopleFailed: joinFailed.size, peopleRate: ratio(joinFailed.size, joinTried.size),
      },
      save: {
        attempts: saves + saveFails, failed: saveFails, rate: ratio(saveFails, saves + saveFails),
        people: saveTried.size, peopleFailed: saveFailed.size, peopleRate: ratio(saveFailed.size, saveTried.size),
      },
    };
    const success = of("join_success");
    joins[ui] = {
      new: success.filter((e) => e.joinType === "new").length,
      returning: success.filter((e) => e.joinType === "returning").length,
      unknown: success.filter((e) => !e.joinType).length,
    };
  }
  const bTried = new Set(events.filter((e) => (e.name === "ui_view" && e.uiVersion === "B") || e.name === "ui_load_fail").map((e) => e.visitorId));
  const bRetry = new Set(events.filter((e) => e.name === "ui_load_fail" && e.reason === "chunk_retry").map((e) => e.visitorId));
  const bFailed = new Set(events.filter((e) => e.name === "ui_load_fail" && e.reason === "chunk_failed").map((e) => e.visitorId));
  failures.B.load = {
    people: bTried.size, retried: bRetry.size, retryRate: ratio(bRetry.size, bTried.size),
    failed: bFailed.size, failedRate: ratio(bFailed.size, bTried.size),
  };

  return {
    experiment,
    assignment: { A: exposed.A, B: exposed.B, srmPValue: srm === null ? null : Math.round(srm * 10000) / 10000, stateFailOnly },
    tables: { qualifying: qualifying.size, changed: changedTables, closed: closed.length },
    preference: { conditional: preference, allTables, triedShare, byHistory },
    failures,
    joins,
    verdict: verdictOf({ srm, preference }),
  };
};

module.exports = { getState, start, stop, getReport, finalOf, preferenceOf, verdictOf, RULE };
