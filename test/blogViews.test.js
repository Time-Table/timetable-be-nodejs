const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-token";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin-password";

const { assemble } = require("../services/blogViewService");
const { VALIDATION_RULES } = require("../utils/constants");
const { startTestServer } = require("./helpers/testApp");

/**
 * 블로그 조회 집계는 DB 없이 순수 조립 함수(assemble)로 검증한다. DB 파이프라인 자체는 여기서 돌지 않는다.
 * 운영 MongoDB에 테스트가 붙는 일은 없어야 한다.
 */

const base = {
  postRows: [],
  visitorCount: 0,
  dateRows: [],
  sourceRows: [],
  reachedLanding: 0,
  createdTable: 0,
  startDate: null,
  endDate: "2026-09-13",
  firstDate: null,
};

test("조회가 없으면 전부 0이고 series는 비어 있다", () => {
  const result = assemble(base);
  assert.deepEqual(result.total, { views: 0, visitors: 0 });
  assert.deepEqual(result.posts, []);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.series, []);
  assert.deepEqual(result.conversion, {
    blogVisitors: 0,
    reachedLanding: 0,
    createdTable: 0,
    reachedLandingPercent: 0,
    createdTablePercent: 0,
  });
});

test("total.views는 글별 views의 합이고 visitors는 고유 방문자 수다", () => {
  const result = assemble({
    ...base,
    postRows: [
      { slug: "post-a", views: 3, visitors: 2, lastViewedAt: new Date("2026-09-11T02:00:00Z") },
      { slug: "post-b", views: 1, visitors: 1, lastViewedAt: new Date("2026-09-11T03:00:00Z") },
    ],
    visitorCount: 2,
  });
  assert.deepEqual(result.total, { views: 4, visitors: 2 });
  assert.equal(result.posts[0].slug, "post-a");
  assert.equal(result.posts[0].views, 3);
  assert.equal(result.posts[0].visitors, 2);
});

test("글은 조회수 내림차순, 같으면 slug 순으로 정렬된다", () => {
  const result = assemble({
    ...base,
    postRows: [
      { slug: "zeta", views: 1, visitors: 1 },
      { slug: "alpha", views: 1, visitors: 1 },
      { slug: "mid", views: 5, visitors: 1 },
    ],
    visitorCount: 1,
  });
  assert.deepEqual(
    result.posts.map((p) => p.slug),
    ["mid", "alpha", "zeta"],
  );
  assert.equal(result.posts[0].lastViewedAt, null);
});

test("series는 기간 안의 모든 날짜를 0으로 채운다", () => {
  const result = assemble({
    ...base,
    dateRows: [{ date: "2026-09-11", views: 1 }],
    startDate: "2026-09-10",
    endDate: "2026-09-12",
  });
  assert.deepEqual(result.series, [
    { date: "2026-09-10", views: 0 },
    { date: "2026-09-11", views: 1 },
    { date: "2026-09-12", views: 0 },
  ]);
});

test("전체 기간이면 첫 기록일부터 오늘까지 series를 만든다", () => {
  const result = assemble({
    ...base,
    dateRows: [{ date: "2026-09-12", views: 1 }],
    startDate: null,
    firstDate: "2026-09-11",
    endDate: "2026-09-13",
  });
  assert.deepEqual(
    result.series.map((s) => s.date),
    ["2026-09-11", "2026-09-12", "2026-09-13"],
  );
});

test("출처는 비율과 함께 많은 순으로, 없는 출처는 (알 수 없음)으로 나온다", () => {
  const result = assemble({
    ...base,
    sourceRows: [
      { source: null, count: 1 },
      { source: "google.com", count: 2 },
    ],
    visitorCount: 3,
  });
  assert.deepEqual(result.sources, [
    { label: "google.com", count: 2, percent: 66.7 },
    { label: "(알 수 없음)", count: 1, percent: 33.3 },
  ]);
});

test("전환율의 분모는 블로그 방문자 수다", () => {
  const result = assemble({ ...base, visitorCount: 3, reachedLanding: 2, createdTable: 1 });
  assert.deepEqual(result.conversion, {
    blogVisitors: 3,
    reachedLanding: 2,
    createdTable: 1,
    reachedLandingPercent: 66.7,
    createdTablePercent: 33.3,
  });
});

test("slug 규칙은 blogPosts.js의 slug 형식만 통과시킨다", () => {
  const ok = ["group-project-schedule-coordination", "a", "post-1", "a".repeat(80)];
  const bad = ["", "Upper-Case", "with space", "한글", "a/b", "a".repeat(81), "a?b=1"];
  ok.forEach((s) => assert.ok(VALIDATION_RULES.BLOG_SLUG.test(s), `${s} 는 통과해야 합니다`));
  bad.forEach((s) => assert.ok(!VALIDATION_RULES.BLOG_SLUG.test(s), `${s} 는 막혀야 합니다`));
});

test("POST /api/blog-views 는 형식이 틀리면 DB에 닿기 전에 400을 준다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  const post = (body) =>
    fetch(`${base}/api/blog-views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  assert.equal((await post({ slug: "Bad Slug", visitorId: "v1" })).status, 400);
  assert.equal((await post({ slug: "ok-slug" })).status, 400);
  assert.equal((await post({ slug: "ok-slug", visitorId: "x".repeat(65) })).status, 400);
  assert.equal((await post({})).status, 400);
});

test("관리자 모드 브라우저의 블로그 조회는 저장하지 않고 skipped 로 답한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  // DB 연결이 없으므로 저장을 시도했다면 500이 나온다. 200 + skipped 여야 통과.
  const res = await fetch(`${base}/api/blog-views`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Mode": "true" },
    body: JSON.stringify({ slug: "ok-slug", visitorId: "v1" }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, skipped: true });
});

test("GET /api/blog-views/stats 는 days가 0 또는 1~365 정수가 아니면 DB 전에 400을 준다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);
  const headers = { "X-Admin-Token": process.env.ADMIN_TOKEN };

  for (const bad of ["abc", "-1", "0.1", "366", "100000", "Infinity", "7&days=8", "[toString]=x", "[]=7"]) {
    // 배열·객체 형태(days[]=7, days[toString]=x)는 쿼리 파서가 객체로 만든다. 예외 없이 400이어야 한다.
    const res = await fetch(`${base}/api/blog-views/stats?days${bad.startsWith("[") ? bad : `=${bad}`}`, { headers });
    assert.equal(res.status, 400, `days=${bad} 는 400이어야 합니다 (실제 ${res.status})`);
  }

  // 유효한 값은 DB까지 간다. 연결이 없으므로 500이지만 400·401은 아니어야 한다.
  for (const ok of ["", "0", "7", "365"]) {
    const res = await fetch(`${base}/api/blog-views/stats?days=${ok}`, { headers });
    assert.ok(![400, 401].includes(res.status), `days=${ok} 는 통과해야 합니다 (실제 ${res.status})`);
  }
});

test("POST /api/blog-views 는 같은 브라우저(visitorId)가 분당 20회를 넘으면 429, 같은 IP의 다른 브라우저는 통과한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  // 관리자 모드 헤더를 붙여 DB에 닿지 않게 하고 제한기만 본다.
  // 제한기는 모듈 단위라 이 파일의 앞선 테스트가 보낸 요청도 같은 창에 세어진다.
  const post = (visitorId) =>
    fetch(`${base}/api/blog-views`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Mode": "true" },
      body: JSON.stringify({ slug: "ok-slug", visitorId }),
    });

  let limited = null;
  for (let i = 0; i < 21 && !limited; i += 1) {
    const res = await post("same-browser");
    if (res.status === 429) limited = i + 1;
    else assert.equal(res.status, 200, `${i + 1}번째 요청이 429도 200도 아닙니다 (${res.status})`);
  }
  assert.ok(limited && limited <= 21, "같은 visitorId는 21회 안에 429가 나와야 합니다");

  // 같은 IP(127.0.0.1)라도 다른 브라우저 30명이 한 번씩 읽는 것은 막지 않는다.
  for (let i = 0; i < 30; i += 1) {
    const res = await post(`reader-${i}`);
    assert.equal(res.status, 200, `다른 방문자 ${i + 1}번째가 막혔습니다 (${res.status})`);
  }
});
