const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-token";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin-password";

const Visiter = require("../models/Visiter");
const service = require("../services/landingStatsService");
const { startTestServer } = require("./helpers/testApp");

/**
 * 랜딩 신뢰 표시용 공개 집계(2026-10-04). DB는 Visiter.find를 가짜로 바꿔 쓴다.
 * 운영 MongoDB에 테스트가 붙는 일은 없어야 한다.
 */

/** Visiter.find(...).select(...).lean()을 흉내 낸다. */
const fakeFind = (docs) => () => ({ select: () => ({ lean: async () => docs }) });

test("창은 어제까지 30일이다(오늘은 뺀다)", () => {
  assert.deepEqual(service.windowEndingYesterday("2026-10-04"), { startDate: "2026-09-04", asOf: "2026-10-03", days: 30 });
  // 달·해가 바뀌어도 날짜로 센다.
  assert.deepEqual(service.windowEndingYesterday("2027-01-01"), { startDate: "2026-12-02", asOf: "2026-12-31", days: 30 });
});

test("날짜별 카운터의 참여 등록 건수를 더하고, 없는 값은 0으로 본다", () => {
  assert.equal(service.sumSignUps([]), 0);
  assert.equal(service.sumSignUps([{ todaySignUp: 5 }, { todaySignUp: 13 }, {}, { todaySignUp: "7" }, null]), 25);
});

test("같은 날에는 DB를 한 번만 읽고, 날이 바뀌면 다시 센다", async (t) => {
  service.resetCache();
  const find = t.mock.method(Visiter, "find", fakeFind([{ todaySignUp: 200 }, { todaySignUp: 23 }]));

  const first = await service.getLandingStats({ today: "2026-10-04" });
  assert.deepEqual(first, { startDate: "2026-09-04", asOf: "2026-10-03", days: 30, count: 223 });
  assert.deepEqual(find.mock.calls[0].arguments[0], { date: { $gte: "2026-09-04", $lte: "2026-10-03" } });

  const again = await service.getLandingStats({ today: "2026-10-04" });
  assert.equal(again.count, 223);
  assert.equal(find.mock.callCount(), 1, "같은 날 두 번째는 캐시");

  const next = await service.getLandingStats({ today: "2026-10-05" });
  assert.equal(next.asOf, "2026-10-04");
  assert.equal(find.mock.callCount(), 2, "날이 바뀌면 다시 읽는다");
});

test("0건은 하루 동안 들고 있지 않는다(DB가 비어 답했을 수 있다)", async (t) => {
  service.resetCache();
  const find = t.mock.method(Visiter, "find", fakeFind([]));
  assert.equal((await service.getLandingStats({ today: "2026-10-04" })).count, 0);
  assert.equal((await service.getLandingStats({ today: "2026-10-04" })).count, 0);
  assert.equal(find.mock.callCount(), 2);
});

test("GET /api/stats/landing은 공개이고 {success, data}와 한 시간 캐시 헤더를 돌려준다", async (t) => {
  service.resetCache();
  t.mock.method(Visiter, "find", fakeFind([{ todaySignUp: 150 }, { todaySignUp: 73 }]));
  const { base, close } = await startTestServer();
  try {
    const res = await fetch(`${base}/api/stats/landing`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.count, 223);
    assert.equal(body.data.days, 30);
    assert.match(body.data.asOf, /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    await close();
    service.resetCache();
  }
});
