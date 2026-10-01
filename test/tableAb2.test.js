const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_TOKEN = "test-admin-token";

const Event = require("../models/Event");
const Table = require("../models/Table");
const User = require("../models/User");
const Experiment = require("../models/Experiment");
const TableActivation = require("../models/TableActivation");
const { recordEvent } = require("../services/eventService");
const { tableUiFor, TABLE_AB } = require("../utils/tableExperiment");
const { getState, start, stop, getReport, finalOf, preferenceOf, verdictOf } = require("../services/tableAbService");
const { startTestServer } = require("./helpers/testApp");

// 표 화면 A/B 2회차(2026-10-01, 하네스 specs/table-ab-2.md). FE src/utils/tableExperiment.test.js와 같은 확인값이다.
const V_A = "00000000-0000-4000-8000-000000000000"; // 칸 56 → A
const V_B = "11111111-1111-4111-8111-111111111111"; // 칸 14 → B

test("사람 단위 배정은 FE와 같은 값을 낸다", () => {
  assert.equal(TABLE_AB.key, "table-ab-2");
  assert.equal(tableUiFor(V_A), "A");
  assert.equal(tableUiFor(V_B), "B");
});

test("2회차 기록은 표·화면·구간 ID·이유가 맞아야 저장하고, 자유 문자열은 버린다", async (t) => {
  const roleLookup = t.mock.method(Table, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  t.mock.method(Event, "create", async (data) => data);
  const base = { visitorId: "v", tableId: "t", uiVersion: "B", viewId: "view-1", tabId: "tab-1", seq: 3 };

  const view = await recordEvent({ name: "ui_view", ...base, source: "utm 자유 문자열" });
  assert.equal(view.viewId, "view-1");
  assert.equal(view.tabId, "tab-1");
  assert.equal(view.seq, 3);
  assert.equal(view.source, undefined, "2회차 기록에는 source를 두지 않는다");
  assert.equal(view.tableRole, undefined, "자주 오는 기록에는 역할 조회를 하지 않는다");
  assert.equal(roleLookup.mock.callCount(), 0);

  assert.equal(await recordEvent({ name: "ui_view", ...base, tableId: undefined }), null);
  assert.equal(await recordEvent({ name: "ui_view", ...base, uiVersion: "C" }), null);
  assert.equal(await recordEvent({ name: "ui_view", ...base, viewId: "공백 있는 값" }), null);
  // 2026-10-02 사람 정정: 판정은 마감 때 유지한 화면이라 머묾·머문 시간 기록은 받지 않는다.
  assert.equal(await recordEvent({ name: "ui_engaged", ...base }), null);
  assert.equal(await recordEvent({ name: "ui_leave", ...base, dwellMs: 5000 }), null);
  assert.equal((await recordEvent({ name: "ui_view", ...base, dwellMs: 5000 })).dwellMs, undefined);

  assert.equal(await recordEvent({ name: "join_fail", ...base, reason: "모르는 값" }), null);
  assert.equal((await recordEvent({ name: "join_fail", ...base, reason: "wrong_password" })).reason, "wrong_password");
  assert.equal((await recordEvent({ name: "save_fail", ...base, reason: "rejected" })).reason, "rejected");
  assert.equal(await recordEvent({ name: "save_fail", ...base, reason: "wrong_password" }), null);
  assert.equal((await recordEvent({ name: "ui_load_fail", ...base, reason: "chunk_retry" })).reason, "chunk_retry");
  const stateFail = await recordEvent({ name: "ab_state_fail", visitorId: "v", tableId: "t", reason: "timeout" });
  assert.equal(stateFail.reason, "timeout");
  assert.equal(stateFail.uiVersion, undefined);

  assert.equal((await recordEvent({ name: "join_success", visitorId: "v", tableId: "t", joinType: "new" })).joinType, "new");
  assert.equal((await recordEvent({ name: "join_success", visitorId: "v", tableId: "t", joinType: "다른 값" })).joinType, undefined);
  assert.equal((await recordEvent({ name: "schedule_save", visitorId: "v", tableId: "t", joinType: "new" })).joinType, undefined);
  // 기존 이벤트는 그대로 source를 남긴다.
  assert.equal((await recordEvent({ name: "landing_view", visitorId: "v", source: "kakao" })).source, "kakao");
});

test("POST /api/events는 페이지가 사라지는 중 보내는 text/plain JSON도 받는다", async (t) => {
  const created = t.mock.method(Event, "create", async (data) => data);
  const server = await startTestServer();
  t.after(server.close);
  const send = (body, type = "text/plain;charset=UTF-8") =>
    fetch(`${server.base}/api/events`, { method: "POST", headers: { "Content-Type": type }, body });

  const ok = await send(JSON.stringify({ name: "ui_load_fail", visitorId: "v", tableId: "t", uiVersion: "B", reason: "chunk_retry" }));
  assert.equal(ok.status, 200);
  assert.equal(created.mock.callCount(), 1);
  assert.equal(created.mock.calls[0].arguments[0].reason, "chunk_retry");

  const broken = await send("{이건 JSON이 아님");
  assert.equal(broken.status, 200);
  assert.equal(created.mock.callCount(), 1, "못 읽는 본문은 저장하지 않는다");

  const tooBig = await send(JSON.stringify({ name: "ui_load_fail", pad: "x".repeat(9000) }));
  assert.ok(tooBig.status >= 400, "8KB를 넘으면 받지 않는다");
});

const fakeExperiment = (t, doc) => {
  let state = doc ? { ...doc } : null;
  t.mock.method(Experiment, "findOne", () => {
    const value = state ? { ...state } : null;
    return { lean: async () => value, maxTimeMS: () => ({ lean: async () => value }) };
  });
  t.mock.method(Experiment, "findOneAndUpdate", (filter, update) => {
    const startedOk = filter.startedAt?.$exists === false ? !state?.startedAt : filter.startedAt?.$exists ? Boolean(state?.startedAt) : true;
    const stoppedOk = filter.stoppedAt?.$exists === false ? !state?.stoppedAt : true;
    const match = startedOk && stoppedOk && (state || filter.startedAt?.$exists === false);
    if (match) state = { ...(state || { key: filter.key }), ...update.$set };
    const result = match ? { ...state } : null;
    const promise = Promise.resolve(result);
    promise.lean = async () => result;
    return promise;
  });
  return () => state;
};

test("켜고 끄기: 꺼짐 → 시작(한 번) → 중단(한 번), 되돌리기 없음", async (t) => {
  fakeExperiment(t, null);
  assert.equal((await getState()).state, "off");
  assert.deepEqual((await stop()).conflict, true, "시작 전에는 중단할 수 없다");
  const started = await start(new Date("2026-10-10T00:00:00Z"));
  assert.equal(started.state.state, "running");
  assert.equal(started.state.startedAt, "2026-10-10T09:00:00+09:00");
  assert.equal((await start()).conflict, true, "두 번 시작할 수 없다");
  const stopped = await stop(new Date("2026-10-20T00:00:00Z"));
  assert.equal(stopped.state.state, "stopped");
  assert.equal((await stop()).conflict, true, "두 번 중단할 수 없다");
});

test("마감 때 유지한 화면: 같은 탭은 순번, 다른 탭은 시각, 30초 안 다른 화면은 순서 불명", () => {
  assert.equal(finalOf([]), null);
  // 같은 탭: 늦게 받은 기록이라도 순번이 큰 쪽이 마지막
  assert.deepEqual(finalOf([{ tabId: "t1", seq: 5, at: 1000, ui: "B" }, { tabId: "t1", seq: 4, at: 2000, ui: "A" }]), { ui: "B", at: 1000 });
  // 다른 탭: 시각이 늦은 쪽, 차이가 30초 이상이면 분명
  assert.deepEqual(finalOf([{ tabId: "t1", seq: 1, at: 0, ui: "A" }, { tabId: "t2", seq: 1, at: 60000, ui: "B" }]), { ui: "B", at: 60000 });
  assert.deepEqual(finalOf([{ tabId: "t1", seq: 1, at: 0, ui: "A" }, { tabId: "t2", seq: 1, at: 10000, ui: "B" }]), { ambiguous: true });
  assert.deepEqual(finalOf([{ tabId: "t1", seq: 1, at: 0, ui: "B" }, { tabId: "t2", seq: 1, at: 10000, ui: "B" }]), { ui: "B", at: 10000 });
});

test("조건부 선호: 배정별 최종 B 비율과 평균·구간, 판정은 문턱을 정하기 전까지 보류", () => {
  const rows = [
    ...Array.from({ length: 8 }, () => ({ assigned: "A", switched: true, final: { ui: "B" } })),
    ...Array.from({ length: 2 }, () => ({ assigned: "A", switched: true, final: { ui: "A" } })),
    ...Array.from({ length: 6 }, () => ({ assigned: "B", switched: true, final: { ui: "B" } })),
    ...Array.from({ length: 4 }, () => ({ assigned: "B", switched: true, final: { ui: "A" } })),
    { assigned: "B", switched: true, final: { ambiguous: true } },
    { assigned: "A", switched: false, final: { ui: "A" } }, // 교체하지 않은 사람은 세지 않는다
  ];
  const p = preferenceOf(rows);
  assert.equal(p.A.tried, 10);
  assert.equal(p.A.rate, 80);
  assert.equal(p.B.tried, 10);
  assert.equal(p.B.rate, 60);
  assert.equal(p.B.ambiguous, 1);
  assert.equal(p.mean, 70);
  assert.ok(p.ci95[0] < 70 && p.ci95[1] > 70);
  assert.equal(verdictOf({ srm: 0.5, preference: p }), "rule_pending");
  // 표본이 적고 100%여도 구간 폭이 0이 아니다(Codex 2026-10-02: 정규 근사는 100~100%였다).
  const tiny = preferenceOf([{ assigned: "A", switched: true, final: { ui: "B" } }, { assigned: "B", switched: true, final: { ui: "B" } }]);
  assert.equal(tiny.mean, 100);
  assert.ok(tiny.ci95[0] < 60 && tiny.ci95[1] === 100, `구간 ${tiny.ci95}`);
  assert.equal(verdictOf({ srm: 0.001, preference: p }), "srm_alert");
});

const chain = (value, methods) => {
  const obj = {};
  for (const m of methods) obj[m] = () => obj;
  obj.lean = async () => value;
  return obj;
};

test("결과: 대상 표(마감까지 3명 등록)에서 교체한 사람이 마감 때 유지한 화면, 실패·참여, 이름·ID 없음", async (t) => {
  const startedAt = new Date("2026-10-10T00:00:00Z");
  const now = new Date("2026-10-30T00:00:00Z");
  fakeExperiment(t, { key: "table-ab-2", startedAt });
  const at = (h) => new Date(+startedAt + h * 3600 * 1000);
  const ev = (name, visitorId, h, extra = {}) => ({ name, visitorId, tableId: "T1", createdAt: at(h), ...extra });
  // T1 마감 = 10-11 20:00 KST = 시작 뒤 35시간.
  const V_C = "33333333-3333-4333-8333-333333333333"; // 배정 A
  const V_D = "55555555-5555-4555-8555-555555555555"; // 배정 B
  assert.deepEqual([tableUiFor(V_C), tableUiFor(V_D)], ["A", "B"]);
  const events = [
    // V_A(배정 A): A를 보다 B로 바꾸고 그대로 둠 → B 유지
    ev("ui_view", V_A, 1, { uiVersion: "A", viewId: "a1", tabId: "x", seq: 1 }),
    ev("ui_switch", V_A, 1.1, { uiVersion: "B", viewId: "a1", tabId: "x", seq: 2 }),
    ev("ui_view", V_A, 1.1, { uiVersion: "B", viewId: "a2", tabId: "x", seq: 3 }),
    ev("join_submit", V_A, 1.15, { uiVersion: "B" }),
    ev("join_fail", V_A, 1.16, { uiVersion: "B", reason: "wrong_password" }),
    ev("join_success", V_A, 1.17, { uiVersion: "B", joinType: "returning" }),
    ev("ui_view", V_A, 20, { uiVersion: "B", viewId: "a3", tabId: "z", seq: 1 }), // 다음 방문에도 B
    // V_B(배정 B): B를 보다 A로 바꾸고 곧 나감 → 머문 시간과 상관없이 A 유지
    ev("ui_view", V_B, 2, { uiVersion: "B", viewId: "b1", tabId: "y", seq: 1 }),
    ev("join_success", V_B, 2.05, { uiVersion: "B", joinType: "new" }),
    ev("save_fail", V_B, 2.06, { uiVersion: "B", reason: "network" }),
    ev("schedule_save", V_B, 2.07, { uiVersion: "B" }),
    ev("ui_switch", V_B, 2.1, { uiVersion: "A", viewId: "b1", tabId: "y", seq: 2 }),
    ev("ui_view", V_B, 2.1, { uiVersion: "A", viewId: "b2", tabId: "y", seq: 3 }),
    // V_C(배정 A): 마감 전에는 A만 보고, 마감 뒤에 B로 바꿈 → 대상 표 기준으로는 교체 안 한 사람
    ev("ui_view", V_C, 3, { uiVersion: "A", viewId: "c1", tabId: "w", seq: 1 }),
    ev("ui_switch", V_C, 40, { uiVersion: "B", viewId: "c1", tabId: "w", seq: 2 }),
    ev("ui_view", V_C, 40, { uiVersion: "B", viewId: "c2", tabId: "w", seq: 3 }),
    // V_D(배정 B): 바꾸지 않음
    ev("ui_view", V_D, 4, { uiVersion: "B", viewId: "d1", tabId: "v", seq: 1 }),
    // 상태를 못 받은 브라우저
    { name: "ab_state_fail", visitorId: "22222222-2222-4222-8222-222222222222", tableId: "T1", reason: "timeout", createdAt: at(3) },
  ];
  t.mock.method(Event, "find", () => chain(events, ["select", "sort", "maxTimeMS"]));
  t.mock.method(Event, "distinct", () => ({ maxTimeMS: async () => [V_A] }));
  // T1: 10-11 마감(현재 값), 3명 등록 → 대상 표
  t.mock.method(Table, "find", () => chain([{ tableId: "T1", dates: ["2026-10-11"], endHour: "20:00", createdAt: at(-1) }], ["select", "maxTimeMS"]));
  t.mock.method(User, "aggregate", () => ({ option: async () => [{ _id: "T1", count: 3 }] }));
  t.mock.method(TableActivation, "find", () => chain([{ _id: "T1", scheduleChanged: false }], ["select", "maxTimeMS"]));

  const report = await getReport(now);
  assert.equal(report.experiment.state, "running");
  assert.equal(report.experiment.engagedSeconds, undefined, "머묾 기준은 없다");
  assert.deepEqual({ A: report.assignment.A, B: report.assignment.B }, { A: 2, B: 2 });
  assert.equal(report.assignment.stateFailOnly.A + report.assignment.stateFailOnly.B, 1);
  assert.equal(report.tables.qualifying, 1);
  const pref = report.preference.conditional;
  assert.deepEqual([pref.A.tried, pref.A.finalB, pref.B.tried, pref.B.finalB], [1, 1, 1, 0]);
  assert.equal(pref.mean, 50);
  const all = report.preference.allTables;
  assert.deepEqual([all.A.tried, all.A.finalB, all.B.tried, all.B.finalB], [2, 2, 1, 0], "모든 표 기준이면 마감 뒤 교체도 센다");
  assert.deepEqual(report.preference.triedShare, { A: 100, B: 50 });
  assert.equal(report.preference.byHistory.observed.A.tried, 1, "실험 전 기록이 관측된 브라우저");
  assert.equal(report.failures.B.join.failed, 1);
  assert.equal(report.failures.B.join.rate, 100);
  assert.deepEqual(report.failures.B.join.byReason, { wrong_password: 1 });
  assert.equal(report.failures.B.save.attempts, 2);
  assert.equal(report.failures.B.save.rate, 50);
  assert.deepEqual(report.joins.B, { new: 1, returning: 1, unknown: 0 });
  assert.equal(report.dwell, undefined, "머문 시간은 집계하지 않는다");
  assert.equal(report.verdict, "rule_pending");
  const text = JSON.stringify(report);
  for (const secret of [V_A, V_B, V_C, V_D, "T1"]) assert.ok(!text.includes(secret), `결과에 ${secret}가 없어야 한다`);
});

test("여러 표: 한 브라우저는 한 줄, 유지한 화면은 본 대상 표들 중 가장 늦은 마감 때의 선택(어느 표에서 바꿨든)", async (t) => {
  const startedAt = new Date("2026-10-10T00:00:00Z");
  const now = new Date("2026-10-30T00:00:00Z");
  fakeExperiment(t, { key: "table-ab-2", startedAt });
  const at = (h) => new Date(+startedAt + h * 3600 * 1000);
  const ev = (name, visitorId, tableId, h, extra = {}) => ({ name, visitorId, tableId, createdAt: at(h), ...extra });
  // 마감: T1 = 시작 뒤 35시간(3명), T3 = 83시간(3명), T2 = 35시간(1명, 대상 아님).
  const V_C = "33333333-3333-4333-8333-333333333333"; // 배정 A
  const events = [
    // V_A(배정 A): 대상 아닌 T2에서 A→B로 바꾸고, 대상 T1에서는 B만 봄 → 교체한 사람, B 유지
    ev("ui_view", V_A, "T2", 1, { uiVersion: "A", tabId: "x", seq: 1 }),
    ev("ui_switch", V_A, "T2", 1.1, { uiVersion: "B", tabId: "x", seq: 2 }),
    ev("ui_view", V_A, "T2", 1.1, { uiVersion: "B", tabId: "x", seq: 3 }),
    ev("ui_view", V_A, "T1", 2, { uiVersion: "B", tabId: "y", seq: 1 }),
    // V_B(배정 B): T1에서 B→A, 뒤 마감인 T3에서 A, T3 마감 뒤 B로 다시 바꿈 → 대상 표 기준 A 유지
    ev("ui_view", V_B, "T1", 3, { uiVersion: "B", tabId: "z", seq: 1 }),
    ev("ui_switch", V_B, "T1", 3.1, { uiVersion: "A", tabId: "z", seq: 2 }),
    ev("ui_view", V_B, "T1", 3.1, { uiVersion: "A", tabId: "z", seq: 3 }),
    ev("ui_view", V_B, "T3", 50, { uiVersion: "A", tabId: "w", seq: 1 }),
    ev("ui_switch", V_B, "T3", 90, { uiVersion: "B", tabId: "w", seq: 2 }),
    ev("ui_view", V_B, "T3", 90, { uiVersion: "B", tabId: "w", seq: 3 }),
    // V_C(배정 A): 대상 T1에서 A를 보고, T1 마감 전에 대상 아닌 T2에서 B로 바꾼 뒤 T1을 다시 열지 않음 → 마감 때 선택은 B
    ev("ui_view", V_C, "T1", 3, { uiVersion: "A", tabId: "c", seq: 1 }),
    ev("ui_switch", V_C, "T2", 10, { uiVersion: "B", tabId: "d", seq: 2 }),
    ev("ui_view", V_C, "T2", 10, { uiVersion: "B", tabId: "d", seq: 3 }),
  ];
  t.mock.method(Event, "find", () => chain(events, ["select", "sort", "maxTimeMS"]));
  t.mock.method(Event, "distinct", () => ({ maxTimeMS: async () => [] }));
  t.mock.method(Table, "find", () => chain([
    { tableId: "T1", dates: ["2026-10-11"], endHour: "20:00", createdAt: at(-1) },
    { tableId: "T2", dates: ["2026-10-11"], endHour: "20:00", createdAt: at(-1) },
    { tableId: "T3", dates: ["2026-10-13"], endHour: "20:00", createdAt: at(-1) },
  ], ["select", "maxTimeMS"]));
  t.mock.method(User, "aggregate", () => ({ option: async () => [{ _id: "T1", count: 3 }, { _id: "T2", count: 1 }, { _id: "T3", count: 4 }] }));
  t.mock.method(TableActivation, "find", () => chain([], ["select", "maxTimeMS"]));

  const report = await getReport(now);
  assert.deepEqual(report.tables, { qualifying: 2, changed: 0, closed: 3 });
  const pref = report.preference.conditional;
  assert.deepEqual([pref.A.tried, pref.A.finalB], [2, 2], "다른 표에서 바꾼 것도 교체이고, 대상 표를 다시 안 열어도 마감 때 선택(B)을 쓴다");
  assert.deepEqual([pref.B.tried, pref.B.finalB], [1, 0], "대상 표들 중 마감 전 마지막 화면(T3의 A), 마감 뒤 B는 빼고");
  const all = report.preference.allTables;
  assert.deepEqual([all.B.tried, all.B.finalB], [1, 1], "모든 표 기준이면 마감 뒤 마지막 B");
});

test("중단한 실험은 중단 시각까지 마감된 표만 대상이라, 중단 뒤에 보고서를 다시 봐도 결과가 바뀌지 않는다", async (t) => {
  const startedAt = new Date("2026-10-10T00:00:00Z");
  const stoppedAt = new Date("2026-10-11T00:00:00Z"); // T1 마감(10-11 11:00Z) 전에 중단
  fakeExperiment(t, { key: "table-ab-2", startedAt, stoppedAt });
  const at = (h) => new Date(+startedAt + h * 3600 * 1000);
  const events = [
    { name: "ui_view", visitorId: V_A, tableId: "T1", uiVersion: "A", tabId: "x", seq: 1, createdAt: at(1) },
    { name: "ui_switch", visitorId: V_A, tableId: "T1", uiVersion: "B", tabId: "x", seq: 2, createdAt: at(2) },
    { name: "ui_view", visitorId: V_A, tableId: "T1", uiVersion: "B", tabId: "x", seq: 3, createdAt: at(2) },
  ];
  t.mock.method(Event, "find", () => chain(events, ["select", "sort", "maxTimeMS"]));
  t.mock.method(Event, "distinct", () => ({ maxTimeMS: async () => [] }));
  t.mock.method(Table, "find", () => chain([{ tableId: "T1", dates: ["2026-10-11"], endHour: "20:00", createdAt: at(-1) }], ["select", "maxTimeMS"]));
  t.mock.method(User, "aggregate", () => ({ option: async () => [{ _id: "T1", count: 3 }] }));
  t.mock.method(TableActivation, "find", () => chain([], ["select", "maxTimeMS"]));

  const rightAfter = await getReport(new Date("2026-10-11T01:00:00Z"));
  const muchLater = await getReport(new Date("2026-10-30T00:00:00Z"));
  for (const report of [rightAfter, muchLater]) {
    assert.equal(report.experiment.state, "stopped");
    assert.equal(report.tables.qualifying, 0);
    assert.equal(report.preference.conditional.A.tried, 0);
  }
  assert.deepEqual(muchLater.preference.allTables, rightAfter.preference.allTables);
});

test("하트 투표: 지금 화면에 vote·cancel만 저장하고, 결과는 브라우저마다 마지막 표의 수와 투표율", async (t) => {
  t.mock.method(Event, "create", async (data) => data);
  const base = { visitorId: "v", tableId: "t", tabId: "tab-1", seq: 1 };
  assert.equal((await recordEvent({ name: "ui_vote", ...base, uiVersion: "B", reason: "vote", source: "x" })).reason, "vote");
  assert.equal((await recordEvent({ name: "ui_vote", ...base, uiVersion: "B", reason: "vote", source: "x" })).source, undefined);
  assert.equal((await recordEvent({ name: "ui_vote", ...base, uiVersion: "A", reason: "cancel" })).reason, "cancel");
  assert.equal(await recordEvent({ name: "ui_vote", ...base, uiVersion: "A", reason: "좋아요" }), null, "정해진 이유만");
  assert.equal(await recordEvent({ name: "ui_vote", ...base, reason: "vote" }), null, "화면 없으면 버림");
  t.mock.restoreAll();

  const startedAt = new Date("2026-10-10T00:00:00Z");
  fakeExperiment(t, { key: "table-ab-2", startedAt });
  const at = (h) => new Date(+startedAt + h * 3600 * 1000);
  const ev = (name, visitorId, h, extra = {}) => ({ name, visitorId, tableId: "T1", createdAt: at(h), ...extra });
  const V_C = "33333333-3333-4333-8333-333333333333"; // 배정 A
  const V_D = "55555555-5555-4555-8555-555555555555"; // 배정 B
  const events = [
    // V_A(A): A에 투표 → 바꿔서 B에 투표(옮김) → 마지막 표 B, 교체함
    ev("ui_view", V_A, 1, { uiVersion: "A", tabId: "x", seq: 1 }),
    ev("ui_vote", V_A, 1.1, { uiVersion: "A", reason: "vote", tabId: "x", seq: 2 }),
    ev("ui_switch", V_A, 1.2, { uiVersion: "B", tabId: "x", seq: 3 }),
    ev("ui_view", V_A, 1.2, { uiVersion: "B", tabId: "x", seq: 4 }),
    ev("ui_vote", V_A, 1.3, { uiVersion: "B", reason: "vote", tabId: "x", seq: 5 }),
    // V_B(B): B에 투표, 교체 안 함
    ev("ui_view", V_B, 2, { uiVersion: "B", tabId: "y", seq: 1 }),
    ev("ui_vote", V_B, 2.1, { uiVersion: "B", reason: "vote", tabId: "y", seq: 2 }),
    // V_C(A): 투표했다 취소 → 표 없음
    ev("ui_view", V_C, 3, { uiVersion: "A", tabId: "w", seq: 1 }),
    ev("ui_vote", V_C, 3.1, { uiVersion: "A", reason: "vote", tabId: "w", seq: 2 }),
    ev("ui_vote", V_C, 3.2, { uiVersion: "A", reason: "cancel", tabId: "w", seq: 3 }),
    // V_D(B): 투표 안 함
    ev("ui_view", V_D, 4, { uiVersion: "B", tabId: "v", seq: 1 }),
  ];
  t.mock.method(Event, "find", () => chain(events, ["select", "sort", "maxTimeMS"]));
  t.mock.method(Event, "distinct", () => ({ maxTimeMS: async () => [] }));
  t.mock.method(Table, "find", () => chain([], ["select", "maxTimeMS"]));
  t.mock.method(User, "aggregate", () => ({ option: async () => [] }));
  t.mock.method(TableActivation, "find", () => chain([], ["select", "maxTimeMS"]));

  const { votes } = await getReport(new Date("2026-10-11T00:00:00Z"));
  // 표: V_A 새 화면, V_B 새 화면(V_C는 취소, V_D는 안 함). 화면을 본 브라우저 4 중 2 → 50%.
  assert.deepEqual(votes, { A: 0, B: 2, voters: 2, exposed: 4, rate: 50 });
});
