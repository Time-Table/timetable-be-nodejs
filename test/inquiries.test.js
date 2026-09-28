const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-token";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin-password";

const { buildContext } = require("../services/inquiryService");
const Inquiry = require("../models/Inquiry");
const { startTestServer } = require("./helpers/testApp");

/**
 * 문의 저장은 DB가 필요하므로 여기서 돌지 않는다. DB에 닿기 전에 끝나는 경계
 * (형식 검증·관리자 모드·숨은 칸·IP 제한)와 순수 함수(buildContext)만 검증한다.
 *
 * IP 제한은 모듈 단위라 같은 파일의 요청이 같은 창에 세어진다. 테스트마다
 * X-Forwarded-For로 다른 IP를 주어 서로 섞이지 않게 한다(testApp은 trust proxy 1).
 */

const valid = {
  category: "bug",
  email: "user@example.com",
  summary: "시간 저장이 안 돼요",
  detail: "시간 입력 화면에서 저장을 눌렀는데 반영되지 않습니다.",
};

const postFrom = (base, ip, body, headers = {}) =>
  fetch(`${base}/api/inquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...headers },
    body: JSON.stringify(body),
  });

test("POST /api/inquiries 는 양식이 틀리면 DB에 닿기 전에 400을 준다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  const cases = [
    [{ ...valid, category: "spam" }, "유형"],
    [{ ...valid, category: undefined }, "유형"],
    [{ ...valid, email: "not-an-email" }, "이메일"],
    [{ ...valid, email: `${"a".repeat(250)}@x.com` }, "이메일"],
    [{ ...valid, email: ["user@example.com"] }, "이메일"],
    [{ ...valid, summary: "   " }, "어떤 문의"],
    [{ ...valid, summary: "가".repeat(101) }, "어떤 문의"],
    [{ ...valid, detail: "짧아요" }, "자세한 내용"],
    [{ ...valid, detail: "가".repeat(2001) }, "자세한 내용"],
    [{ ...valid, hope: "가".repeat(1001) }, "바라는 점"],
    [{ ...valid, hope: { $gt: "" } }, "바라는 점"],
  ];

  for (const [body, keyword] of cases) {
    const res = await postFrom(base, "10.0.1.1", body);
    assert.equal(res.status, 400, `${JSON.stringify(body).slice(0, 80)} 가 400이 아닙니다`);
    const json = await res.json();
    assert.ok(json.message.includes(keyword), `메시지에 "${keyword}"가 없습니다: ${json.message}`);
  }
});

test("답장 받을 이메일은 선택이라 없거나 빈 문자열이어도 통과한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  // 관리자 모드로 DB 앞에서 멈춘다. 검증을 통과했다면 200 + skipped.
  const admin = { "X-Admin-Mode": "true" };
  const { email: _omitted, ...withoutEmail } = valid;
  assert.equal((await postFrom(base, "10.0.6.1", withoutEmail, admin)).status, 200);
  assert.equal((await postFrom(base, "10.0.6.2", { ...valid, email: "" }, admin)).status, 200);
  assert.equal((await postFrom(base, "10.0.6.3", { ...valid, email: null }, admin)).status, 200);
  assert.equal((await postFrom(base, "10.0.6.4", { ...valid, email: "   " }, admin)).status, 200);
});

test("관리자 모드 브라우저의 문의는 저장하지 않고 skipped 로 답한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  // DB 연결이 없으므로 저장을 시도했다면 500이 나온다. 200 + skipped 여야 통과.
  const res = await postFrom(base, "10.0.2.1", valid, { "X-Admin-Mode": "true" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, skipped: true });
});

test("숨은 칸(website)이 채워진 요청은 저장하지 않고 성공처럼 답한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  // 저장을 시도했다면 DB 연결이 없어 500이 나온다.
  const res = await postFrom(base, "10.0.3.1", { ...valid, website: "https://spam.example" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { success: true });
});

test("같은 IP는 10분에 3건까지, 4건째는 429이고 다른 IP는 통과한다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  const admin = { "X-Admin-Mode": "true" };
  for (let i = 1; i <= 3; i += 1) {
    const res = await postFrom(base, "10.0.4.1", valid, admin);
    assert.equal(res.status, 200, `${i}번째 요청이 막혔습니다 (${res.status})`);
  }
  assert.equal((await postFrom(base, "10.0.4.1", valid, admin)).status, 429);
  assert.equal((await postFrom(base, "10.0.4.2", valid, admin)).status, 200);
});

test("형식이 틀려 거절된 요청은 IP 한도에 세지 않는다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await postFrom(base, "10.0.5.1", { ...valid, email: "bad" })).status, 400);
  }
  const res = await postFrom(base, "10.0.5.1", valid, { "X-Admin-Mode": "true" });
  assert.equal(res.status, 200, "400 다섯 번 뒤 올바른 문의가 한도에 막혔습니다");
});

test("buildContext 는 사이트 안 경로만 남기고 다른 도메인으로 가는 경로는 버린다", () => {
  const path = (fromPath) => buildContext({ fromPath }).fromPath;

  assert.equal(path("/table/313fcb21-583e-4e82-942c-713eeb3d607d"), "/table/313fcb21-583e-4e82-942c-713eeb3d607d");
  assert.equal(path("/"), "/");
  assert.equal(path("/blog/some-post"), "/blog/some-post");
  assert.equal(path("//evil.example"), undefined);
  assert.equal(path("/\\evil.example"), undefined);
  assert.equal(path("https://evil.example/"), undefined);
  assert.equal(path("javascript:alert(1)"), undefined);
  assert.equal(path("/has space"), undefined);
  assert.equal(path(`/${"a".repeat(300)}`), undefined);
  assert.equal(path(["/table/x"]), undefined);
});

test("buildContext 는 형식이 맞는 값만 남기고 틀린 값은 문의를 막지 않고 버린다", () => {
  const good = buildContext(
    {
      name: "철수",
      tableId: "313fcb21-583e-4e82-942c-713eeb3d607d",
      viewport: "390x844",
      timeZone: "Asia/Seoul",
      visitorId: "0b6f7c1e-5d2a-4d8e-9a1b-2c3d4e5f6a7b",
    },
    "Mozilla/5.0 KAKAOTALK",
  );
  assert.deepEqual(good, {
    name: "철수",
    tableId: "313fcb21-583e-4e82-942c-713eeb3d607d",
    fromPath: undefined,
    userAgent: "Mozilla/5.0 KAKAOTALK",
    viewport: "390x844",
    timeZone: "Asia/Seoul",
    visitorId: "0b6f7c1e-5d2a-4d8e-9a1b-2c3d4e5f6a7b",
  });

  const bad = buildContext(
    {
      name: "<script>",
      tableId: "../../etc",
      viewport: "wide",
      timeZone: "Asia/Seoul; drop",
      visitorId: { $ne: null },
    },
    "U".repeat(500),
  );
  assert.equal(bad.name, undefined);
  assert.equal(bad.tableId, undefined);
  assert.equal(bad.viewport, undefined);
  assert.equal(bad.timeZone, undefined);
  assert.equal(bad.visitorId, undefined);
  assert.equal(bad.userAgent.length, 300, "브라우저 정보는 300자로 자른다");

  assert.equal(buildContext("not-object").name, undefined);
  assert.equal(buildContext(undefined, undefined).userAgent, undefined);
  assert.equal(buildContext({ name: "가".repeat(16) }).name, undefined, "참여 이름 규칙(15자)을 넘으면 버린다");
});

test("문의는 받은 날부터 10년(3,650일) 뒤 자동 삭제된다", () => {
  assert.equal(Inquiry.schema.path("createdAt").options.expires, 60 * 60 * 24 * 3650);
});

test("문의 처리 상태는 새 문의·예정·완료·보류·무시이고 기본값은 새 문의다", () => {
  const status = Inquiry.schema.path("status");
  assert.deepEqual(status.enumValues, ["new", "planned", "done", "onHold", "ignored"]);
  assert.equal(status.options.default, "new");
});

test("문의 상태 변경·삭제는 ID와 상태 형식이 틀리면 DB에 닿기 전에 400을 준다", async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  const admin = { "Content-Type": "application/json", "X-Admin-Token": process.env.ADMIN_TOKEN };
  const patch = (id, body) =>
    fetch(`${base}/api/admin/inquiries/${id}`, { method: "PATCH", headers: admin, body: JSON.stringify(body) });
  const validId = "0123456789abcdef01234567";

  // mongoose.isValidObjectId는 아무 12자 문자열도 통과시키므로 24자리 16진수만 받는지 본다.
  for (const id of ["any-id", "aaaaaaaaaaaa", `${validId}0`, "..%2F..%2Fx"]) {
    const res = await patch(id, { status: "done" });
    assert.equal(res.status, 400, `${id} 가 400이 아닙니다`);
    assert.match((await res.json()).message, /ID/);
    const del = await fetch(`${base}/api/admin/inquiries/${id}`, { method: "DELETE", headers: admin });
    assert.equal(del.status, 400, `DELETE ${id} 가 400이 아닙니다`);
  }

  for (const body of [{}, { status: "finished" }, { status: ["done"] }, { status: { $ne: "new" } }]) {
    const res = await patch(validId, body);
    assert.equal(res.status, 400, `${JSON.stringify(body)} 가 400이 아닙니다`);
    assert.match((await res.json()).message, /상태/);
  }
});
