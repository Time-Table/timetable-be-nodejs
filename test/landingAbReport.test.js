const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_TOKEN = "test-admin-token";

const Event = require("../models/Event");
const Table = require("../models/Table");
const User = require("../models/User");
const Experiment = require("../models/Experiment");
const { fnv1a32, landingVariantFor, LANDING_AB } = require("../utils/landingExperiment");
const { wilson, newcombe, srmPValue, verdictFor } = require("../utils/abStats");
const { getLandingAbReport, stopLandingAb } = require("../services/experimentService");
const { startTestServer } = require("./helpers/testApp");

// 2026-09-29 랜딩 A/B 1회차. FE src/utils/landingExperiment.test.js와 같은 확인값이다.
test("배정 해시는 FE와 같은 값을 낸다", () => {
  assert.equal(fnv1a32(""), 0x811c9dc5);
  assert.equal(fnv1a32("a"), 0xe40c292c);
  assert.equal(fnv1a32("foobar"), 0xbf9cf968);
  assert.equal(fnv1a32("landing-ab-1:00000000-0000-4000-8000-000000000000") % 100, 68);
  assert.equal(fnv1a32("landing-ab-1:11111111-1111-4111-8111-111111111111") % 100, 18);
  assert.equal(landingVariantFor("00000000-0000-4000-8000-000000000000"), "v1");
  assert.equal(landingVariantFor("11111111-1111-4111-8111-111111111111"), "v2");
});

test("Wilson·Newcombe·SRM 값과 경계", () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} ≈ ${b}`);
  const [lo, hi] = wilson(5, 31);
  close(lo, 0.0709);
  close(hi, 0.3263);
  assert.equal(wilson(0, 0), null);
  close(wilson(0, 10)[0], 0);
  close(wilson(10, 10)[1], 1);
  const d = newcombe(10, 100, 20, 100);
  close(d.diff, 0.1);
  close(d.ci[0], 0.00015);
  close(d.ci[1], 0.19947);
  assert.equal(newcombe(1, 0, 1, 10), null);
  assert.equal(srmPValue(50, 50), 1);
  close(srmPValue(60, 40), 0.0455);
  assert.equal(srmPValue(0, 0), null);
});

test("판정은 SRM → 표본 → Newcombe 순서의 하나의 규칙이다", () => {
  const enough = { exposed: 100, success: 10 };
  const diff = (lo, hi, dd = (lo + hi) / 2) => ({ diff: dd, ci: [lo, hi] });
  assert.equal(verdictFor({ srm: 0.001, v1: enough, v2: enough, difference: diff(0.1, 0.2) }), "srm_alert");
  assert.equal(verdictFor({ srm: 0.5, v1: { exposed: 99, success: 30 }, v2: enough, difference: diff(0.1, 0.2) }), "insufficient");
  assert.equal(verdictFor({ srm: 0.5, v1: enough, v2: { exposed: 300, success: 9 }, difference: diff(-0.2, -0.1) }), "insufficient");
  assert.equal(verdictFor({ srm: 0.5, v1: enough, v2: enough, difference: diff(-0.05, 0.1) }), "no_difference");
  assert.equal(verdictFor({ srm: 0.5, v1: enough, v2: enough, difference: diff(0.0001, 0.2) }), "v2_better");
  assert.equal(verdictFor({ srm: 0.5, v1: enough, v2: enough, difference: diff(-0.2, -0.01) }), "v1_better");
  assert.equal(verdictFor({ srm: null, v1: { exposed: 0, success: 0 }, v2: { exposed: 0, success: 0 }, difference: null }), "insufficient");
});

const START = new Date(LANDING_AB.startAt);
const at = (minutes) => new Date(+START + minutes * 60 * 1000);

/** 모델 조회를 가짜로 바꾼다. 쿼리를 기록해 두고 준비한 값을 돌려준다. */
const mockModels = (t, { events = [], stoppedAt, tables = [], registrations = [], firstTracked } = {}) => {
  const seen = { eventQuery: null, tableQueries: [], updates: [] };
  let state = stoppedAt ? { key: LANDING_AB.key, stoppedAt } : null;
  t.mock.method(Event, "find", (query) => {
    seen.eventQuery = query;
    const chain = { select: () => chain, sort: () => chain, maxTimeMS: () => chain, lean: async () => events };
    return chain;
  });
  t.mock.method(Event, "findOne", () => {
    const chain = { sort: () => chain, select: () => chain, lean: async () => (firstTracked ? { createdAt: firstTracked } : null) };
    return chain;
  });
  t.mock.method(Experiment, "findOne", () => ({ lean: async () => state }));
  t.mock.method(Experiment, "findOneAndUpdate", async (filter, update) => {
    seen.updates.push({ filter, update });
    state = { key: LANDING_AB.key, ...update.$set };
    return state;
  });
  t.mock.method(Table, "find", (query) => {
    seen.tableQueries.push(query);
    const ids = query.tableId.$in;
    const chain = { select: () => chain, maxTimeMS: () => chain, lean: async () => tables.filter((row) => ids.includes(row.tableId)) };
    return chain;
  });
  t.mock.method(User, "aggregate", () => ({ option: async () => registrations }));
  return seen;
};

// visitor-a·d → v2, visitor-b·c·e → v1 (해시로 계산한 배정)
const ev = (name, visitorId, minutes, extra = {}) => ({ name, visitorId, createdAt: at(minutes), device: "desktop", ...extra });

test("노출·단계·주 지표를 쪽별로 세고, 점검용 ID와 기기 필터를 적용한다", async (t) => {
  const now = at(60 * 24 * 3);
  const events = [
    ev("landing_view", "visitor-a", 1),
    ev("create_view", "visitor-a", 1, { creationPath: "landing" }),
    ev("create_cta_click", "visitor-a", 2, { creationPath: "landing" }),
    ev("create_submit", "visitor-a", 2, { creationPath: "landing" }),
    ev("create_success", "visitor-a", 2, { creationPath: "landing", tableId: "t-a" }),
    ev("invite_share", "visitor-a", 3, { tableId: "t-a" }),
    ev("landing_view", "visitor-b", 5, { device: "mobile" }),
    ev("create_view", "visitor-b", 5, { creationPath: "landing" }),
    ev("create_success", "visitor-b", 30, { creationPath: "quick_create", tableId: "t-b" }),
    ev("landing_view", "visitor-c", 60 * 24 + 10),
    ev("create_success", "visitor-c", 60 * 24 + 12, { creationPath: "landing", tableId: "t-c" }),
    ev("create_success", "visitor-c", 60 * 24 + 13, { creationPath: "landing", tableId: "t-c" }),
    // 랜딩을 보지 않고 빠른 생성만 한 브라우저는 세지 않는다.
    ev("create_success", "visitor-e", 20, { creationPath: "quick_create", tableId: "t-e" }),
    // 점검용 ID는 뺀다.
    ev("landing_view", "00000000-0000-4000-8000-000000000000", 2),
    ev("landing_view", "11111111-1111-4111-8111-111111111111", 2),
    // 경로 없는 성공(옛 FE)
    ev("landing_view", "visitor-d", 7),
    ev("create_success", "visitor-d", 8, { tableId: "t-d" }),
  ];
  const tables = [
    { tableId: "t-a", dates: ["2026-09-29"], endHour: "12:00", createdAt: at(2) },
    { tableId: "t-b", dates: ["2026-12-31"], endHour: "12:00", createdAt: at(30) },
    { tableId: "t-c", dates: ["2026-09-30"], endHour: "18:00", createdAt: at(60 * 24 + 12) },
  ];
  const seen = mockModels(t, { events, tables, registrations: [{ _id: "t-a", count: 3 }, { _id: "t-c", count: 2 }], firstTracked: at(1) });
  const report = await getLandingAbReport({ now });

  assert.deepEqual(seen.eventQuery.createdAt, { $gte: START, $lt: now }, "시각(createdAt)으로 startAt부터 거른다");
  assert.equal(report.experiment.phase, "running");
  assert.equal(report.experiment.day, 4);
  assert.equal(report.experiment.startAtWarning, false);
  assert.deepEqual(report.assignment.v1 + report.assignment.v2, 4);
  const v1 = report.variants.v1;
  const v2 = report.variants.v2;
  assert.equal(v2.exposed, 2); // a, d
  assert.equal(v1.exposed, 2); // b, c
  const count = (side, key) => [...side.steps, ...side.extraSteps].find((s) => s.key === key).count;
  assert.equal(count(v2, "create_success"), 1);
  assert.equal(count(v2, "create_success_unknown"), 1);
  assert.equal(count(v2, "invite_share"), 1);
  assert.equal(count(v1, "create_view"), 1);
  assert.equal(count(v1, "create_success"), 1);
  assert.equal(count(v1, "create_success_quick"), 1);
  assert.equal(v1.primary.rate, 50);
  assert.deepEqual(v2.tables.landing, { created: 1, closed: 1, reachedThree: 1 });
  assert.deepEqual(v1.tables.landing, { created: 1, closed: 1, reachedThree: 0 });
  assert.deepEqual(v1.tables.quickCreate, { created: 1, closed: 0, reachedThree: 0 });
  assert.equal(report.verdict, "insufficient");
  assert.deepEqual(report.daily, [{ date: "2026-09-29", v1: 1, v2: 2 }, { date: "2026-09-30", v1: 1, v2: 0 }]);

  const mobile = await getLandingAbReport({ now, device: "mobile" });
  assert.equal(mobile.device, "mobile");
  assert.equal(mobile.variants.v1.exposed + mobile.variants.v2.exposed, 1);
  const odd = await getLandingAbReport({ now, device: "tablet" });
  assert.equal(odd.device, "all");
});

test("배포 시각보다 10분 넘게 앞선 기록이 있으면 경고한다", async (t) => {
  mockModels(t, { firstTracked: at(-30) });
  const report = await getLandingAbReport({ now: at(60) });
  assert.equal(report.experiment.startAtWarning, true);
});

test("중단은 한 번만 되고, 중단 뒤에는 그 시각까지만 센다", async (t) => {
  const seen = mockModels(t, {});
  const stopAt = at(120);
  const first = await stopLandingAb(stopAt);
  assert.equal(first.conflict, false);
  assert.equal(first.report.experiment.phase, "stopped");
  assert.equal(seen.updates.length, 1);
  const again = await stopLandingAb(at(200));
  assert.equal(again.conflict, true);
  assert.equal(seen.updates.length, 1, "두 번째는 쓰지 않는다");
  const later = await getLandingAbReport({ now: at(600) });
  assert.deepEqual(seen.eventQuery.createdAt, { $gte: START, $lt: stopAt });
  assert.equal(later.experiment.phase, "stopped");
});

test("관리자 API: 결과 200, 중단 200 뒤 두 번째 409", async (t) => {
  mockModels(t, {});
  const { base, close } = await startTestServer();
  t.after(close);
  const headers = { "X-Admin-Token": process.env.ADMIN_TOKEN };
  const res = await fetch(`${base}/api/admin/experiments/landing-ab?device=mobile`, { headers });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.device, "mobile");
  const stop = await fetch(`${base}/api/admin/experiments/landing-ab/stop`, { method: "POST", headers });
  assert.equal(stop.status, 200);
  const stopAgain = await fetch(`${base}/api/admin/experiments/landing-ab/stop`, { method: "POST", headers });
  assert.equal(stopAgain.status, 409);
  assert.equal((await stopAgain.json()).success, false);
});
