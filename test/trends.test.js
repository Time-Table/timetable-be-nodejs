const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-token";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin-password";

const { assembleTrends } = require("../services/analyticsService");

/**
 * 추이 지표(2026-10-04): 페이지 연 횟수(visits) 옆에 사람 수(visitors)·방문(visitDays)을 더한다.
 * DB 없이 순수 조립(assembleTrends)으로 검증한다.
 */
const metric = (result, key) => result.metrics.find((m) => m.key === key);

test("같은 날 같은 브라우저는 하루 한 번, 여러 날 온 브라우저는 기간 전체에서 한 번 센다", () => {
  const result = assembleTrends({
    today: "2026-10-04",
    span: 3,
    visiterDocs: [{ date: "2026-10-04", todayVisitLandingPage: 10, todayVisitUsePage: 5, todaySignUp: 2 }],
    // 쌍 목록은 이미 중복이 없다(DB에서 $group). a는 3일 모두, b는 하루, c는 직전 기간에만.
    pairs: [
      { date: "2026-10-02", visitorId: "a" },
      { date: "2026-10-03", visitorId: "a" },
      { date: "2026-10-04", visitorId: "a" },
      { date: "2026-10-04", visitorId: "b" },
      { date: "2026-10-01", visitorId: "c" },
      { date: "2026-09-30", visitorId: "c" },
    ],
    eventsSince: "2026-08-01",
  });
  assert.deepEqual(result.series.map((r) => [r.date, r.visitors]), [["2026-10-02", 1], ["2026-10-03", 1], ["2026-10-04", 2]]);
  assert.equal(result.series[2].visits, 15, "페이지 연 횟수는 그대로 카운터 합");
  assert.equal(metric(result, "visitors").total, 2, "기간 안 서로 다른 브라우저 a·b");
  assert.equal(metric(result, "visitDays").total, 4, "브라우저×날짜 쌍 a×3 + b×1");
  assert.equal(metric(result, "visitors").previousTotal, 1, "직전 3일(9/29~10/1)에는 c만");
  assert.equal(metric(result, "visitDays").previousTotal, 2);
  assert.equal(metric(result, "visitors").changePercent, 100);
  assert.deepEqual(result.metrics.map((m) => m.key), ["visitors", "visitDays", "visits", "tables", "signUps", "logins"]);
  assert.equal(result.previousStart, "2026-09-29");
  assert.equal(result.eventsSince, "2026-08-01");
});

test("기록이 없는 날은 0이고, 직전 기간이 0이면 증감률은 null이다", () => {
  const result = assembleTrends({ today: "2026-10-04", span: 2, visiterDocs: [], pairs: [{ date: "2026-10-04", visitorId: "a" }], eventsSince: null });
  assert.deepEqual(result.series.map((r) => r.visitors), [0, 1]);
  assert.equal(metric(result, "visitors").changePercent, null);
  assert.equal(metric(result, "visits").total, 0);
  assert.equal(result.eventsSince, null);
});

test("달·해 경계를 날짜로 센다", () => {
  const result = assembleTrends({ today: "2027-01-01", span: 2, visiterDocs: [], pairs: [{ date: "2026-12-31", visitorId: "x" }], eventsSince: null });
  assert.deepEqual(result.series.map((r) => r.date), ["2026-12-31", "2027-01-01"]);
  assert.equal(result.startDate, "2026-12-31");
  assert.equal(result.previousStart, "2026-12-29");
  assert.equal(metric(result, "visitors").total, 1);
});
