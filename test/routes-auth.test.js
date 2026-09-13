const test = require("node:test");
const assert = require("node:assert/strict");

// requireAdmin은 호출 시점에 env를 읽으므로 앱을 만들기 전에 심어둔다.
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.ADMIN_PASSWORD = "test-admin-password";

const { startTestServer } = require("./helpers/testApp");

/**
 * 라우트 인벤토리.
 *
 * 이 파일의 목적은 "관리자 API가 열려 있는 사고"를 구조적으로 막는 것이다.
 * 실제로 2026-07-29에 DELETE /api/tables/:tableId 가 무인증으로 열려 있었고,
 * 누구나 남의 테이블을 지울 수 있었다.
 *
 * 새 라우트를 추가하면 아래 두 목록 중 하나에 반드시 등록해야 한다.
 * 등록하지 않으면 inventory 테스트가 실패한다(fail-closed).
 * 공개로 두려면 "왜 공개여도 되는지"를 사유로 남긴다.
 */
const PROTECTED = [
  { method: "GET", path: "/api/visits" },
  { method: "GET", path: "/api/tables" },
  { method: "PATCH", path: "/api/tables/any-id" },
  { method: "DELETE", path: "/api/tables/any-id" },
  { method: "GET", path: "/api/events/funnels" },
  { method: "GET", path: "/api/admin/verify" },
  { method: "GET", path: "/api/admin/trends" },
  { method: "GET", path: "/api/admin/audience" },
  { method: "GET", path: "/api/admin/chats" },
  { method: "GET", path: "/api/admin/tables/any-id" },
  { method: "GET", path: "/api/blog-views/stats" },
];

/**
 * 공개 라우트는 **유효한 입력**을 함께 적는다.
 *
 * 빈 body를 보내면 요청이 validator 단계에서 400으로 죽는다. 그러면 그 뒤에 인증
 * 미들웨어가 잘못 추가돼도 거기까지 도달하지 못해 테스트가 그냥 통과해버린다.
 * 핸들러 체인 끝까지 흘러가야 "인증에 막히지 않는다"를 실제로 검증한 것이다.
 */
const PUBLIC = [
  { method: "POST", path: "/api/visits", why: "익명 방문 집계", body: { page: "landing" } },
  {
    method: "POST",
    path: "/api/events",
    why: "익명 퍼널 이벤트 수집",
    body: { name: "landing_view", visitorId: "test-visitor" },
  },
  {
    method: "POST",
    path: "/api/blog-views",
    why: "익명 블로그 조회 기록 (slug·visitorId 형식 검증으로 오염 방지)",
    body: { slug: "test-post", visitorId: "test-visitor" },
  },
  {
    method: "POST",
    path: "/api/admin/login",
    why: "로그인 자체는 열려 있어야 함",
    body: { password: process.env.ADMIN_PASSWORD },
  },
  {
    method: "POST",
    path: "/api/tables",
    why: "누구나 테이블 생성",
    body: {
      title: "검증용",
      dates: ["2026-08-01"],
      startHour: "09:00",
      endHour: "18:00",
      banedCells: [],
    },
  },
  { method: "GET", path: "/api/tables/any-id", why: "초대 링크로 단건 조회" },
  {
    method: "POST",
    path: "/api/users",
    why: "익명 참여",
    body: { tableId: "any-id", name: "검증", password: "pw", availableTimes: [] },
  },
  {
    method: "POST",
    path: "/api/users/verify",
    why: "이름+비밀번호 본인 확인",
    body: { tableId: "any-id", name: "검증", password: "pw" },
  },
  {
    method: "DELETE",
    path: "/api/users",
    why: "본인 비밀번호로 참여 취소",
    body: { tableId: "any-id", name: "검증", password: "pw" },
  },
  { method: "GET", path: "/api/users?tableId=any-id", why: "테이블 참여자 목록 공개" },
  {
    method: "POST",
    path: "/api/schedules",
    why: "참여자 일정 저장",
    body: { tableId: "any-id", name: "검증", availableTimes: [] },
  },
  {
    method: "POST",
    path: "/api/schedules/generation",
    why: "집계 재계산",
    body: { tableId: "any-id" },
  },
  { method: "GET", path: "/api/schedules?tableId=any-id", why: "그룹 시간표 공개" },
  {
    method: "POST",
    path: "/api/chats",
    why: "익명 채팅 작성",
    body: { tableId: "any-id", name: "검증", message: "검증" },
  },
  { method: "GET", path: "/api/chats?tableId=any-id", why: "익명 채팅 조회" },
];

/** requireAdmin이 막았을 때만 나오는 메시지. 컨트롤러의 401과 구분하는 용도. */
const ADMIN_BLOCK_MESSAGE = "관리자 권한이 필요합니다.";

/** 등록된 라우트를 (METHOD, 경로 템플릿) 목록으로 뽑는다. */
const collectRoutes = () => {
  const router = require("../routes/index");
  const found = [];

  const walk = (stack, prefix) => {
    stack.forEach((layer) => {
      if (layer.route) {
        Object.keys(layer.route.methods).forEach((method) =>
          found.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`.replace(/\/$/, "")),
        );
      } else if (layer.handle && layer.handle.stack) {
        const segment = layer.regexp.source.match(/\\\/([\w-]+)/);
        walk(layer.handle.stack, `${prefix}${segment ? `/${segment[1]}` : ""}`);
      }
    });
  };

  walk(router.stack, "/api");
  return found;
};

/** 인벤토리 항목을 실제 등록 경로 표기로 되돌린다. */
const toTemplate = ({ method, path }) =>
  `${method} ${path.split("?")[0].replace(/any-id/, ":tableId")}`.replace(/\/$/, "");

test("모든 라우트가 인벤토리에 분류되어 있다 (fail-closed)", () => {
  const registered = new Set(collectRoutes());
  const classified = new Set([...PROTECTED, ...PUBLIC].map(toTemplate));

  const unclassified = [...registered].filter((route) => !classified.has(route));
  assert.deepEqual(
    unclassified,
    [],
    `분류되지 않은 라우트가 있습니다. test/routes-auth.test.js의 PROTECTED 또는 PUBLIC에 등록하세요:\n  ${unclassified.join("\n  ")}`,
  );

  const stale = [...classified].filter((route) => !registered.has(route));
  assert.deepEqual(stale, [], `더 이상 존재하지 않는 라우트가 인벤토리에 남아 있습니다:\n  ${stale.join("\n  ")}`);
});

test("app.js가 라우트를 직접 등록하지 않는다", () => {
  // 인벤토리는 routes/index만 순회한다. app.js에 app.get/app.delete로 직접 붙인
  // 라우트는 수집되지 않아 분류 검사와 인증 검사를 모두 빠져나간다.
  // 그래서 "라우트는 반드시 routes/를 거친다"를 구조적으로 강제한다.
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "app.js"),
    "utf8",
  );

  const direct = source.match(/\bapp\.(get|post|put|patch|delete|all)\s*\(/g) || [];
  assert.deepEqual(
    direct,
    [],
    `app.js에 직접 등록된 라우트가 있습니다: ${direct.join(", ")}\n` +
      "라우트는 routes/ 안에서만 정의하세요. 그래야 인증 인벤토리 검사를 받습니다.",
  );

  // 라우터 마운트는 /api 하나여야 한다.
  const mounts = source.match(/app\.use\(\s*["'][^"']*["']\s*,/g) || [];
  assert.deepEqual(
    mounts.map((m) => m.match(/["']([^"']*)["']/)[1]),
    ["/api"],
    "라우터 마운트 지점이 /api 하나가 아닙니다. 인벤토리가 커버하지 못하는 경로가 생깁니다.",
  );
});

test("보호 라우트는 토큰 없이 401을 반환한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  for (const route of PROTECTED) {
    const res = await fetch(`${base}${route.path}`, { method: route.method });
    assert.equal(
      res.status,
      401,
      `${route.method} ${route.path} 가 무인증으로 뚫렸습니다 (실제 ${res.status})`,
    );

    // 상태 코드만 보면 컨트롤러가 자기 이유로 뱉은 401과 구분되지 않는다.
    // 예: POST /api/users는 비밀번호가 틀리면 401을 준다. 인증에 막힌 게 아니다.
    const body = await res.json();
    assert.equal(
      body.message,
      ADMIN_BLOCK_MESSAGE,
      `${route.method} ${route.path} 의 401이 requireAdmin이 아닌 다른 곳에서 나왔습니다: ${body.message}`,
    );
  }
});

test("보호 라우트는 잘못된 토큰도 401을 반환한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  for (const route of PROTECTED) {
    const res = await fetch(`${base}${route.path}`, {
      method: route.method,
      headers: { "X-Admin-Token": "wrong-token" },
    });
    assert.equal(res.status, 401, `${route.method} ${route.path} 가 잘못된 토큰을 통과시켰습니다`);
  }
});

test("공개 라우트는 인증 때문에 막히지 않는다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  // DB에 닿는 라우트는 여기서 성공할 수 없다. 401만 아니면 인증 경계는 통과한 것이다.
  for (const route of PUBLIC) {
    const res = await fetch(`${base}${route.path}`, {
      method: route.method,
      headers: { "Content-Type": "application/json" },
      body:
        route.method === "GET" || route.method === "DELETE"
          ? undefined
          : JSON.stringify(route.body || {}),
    });
    assert.notEqual(
      res.status,
      401,
      `${route.method} ${route.path} 는 공개여야 하는데 401입니다 (${route.why})`,
    );
  }
});

test("올바른 토큰은 인증 단계를 통과한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  // DB를 쓰지 않는 관리자 엔드포인트로 확인한다.
  const res = await fetch(`${base}/api/admin/verify`, {
    headers: { "X-Admin-Token": process.env.ADMIN_TOKEN },
  });
  assert.equal(res.status, 200);
});

test("ADMIN_TOKEN이 없으면 열지 않고 503으로 잠근다", async (t) => {
  const original = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  t.after(() => {
    process.env.ADMIN_TOKEN = original;
  });

  const { base, close } = await startTestServer();
  t.after(close);

  const res = await fetch(`${base}/api/admin/trends`);
  assert.equal(res.status, 503, "토큰 미설정 시 무방비로 열리면 안 됩니다");
});
