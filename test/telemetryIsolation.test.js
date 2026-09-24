const test = require("node:test");
const assert = require("node:assert/strict");
const { runTelemetry } = require("../utils/telemetry");
const Sentry = require("@sentry/node");
const Table = require("../models/Table");
const User = require("../models/User");
const visitService = require("../services/visitService");
const tableService = require("../services/tableService");
const userService = require("../services/userService");

const data = { title: "test", dates: ["2099-01-01"], startHour: "09:00", endHour: "18:00" };

test("통계·로그 예외가 생성·신규 참여·재로그인 성공을 뒤집지 않는다", async (t) => {
  t.mock.method(console, "info", () => { throw new Error("log offline"); });
  t.mock.method(Sentry, "captureMessage", () => { throw new Error("sentry offline"); });
  const counter = t.mock.method(visitService, "updateVisitStats", async () => { throw new Error("stats offline"); });
  t.mock.method(Table.prototype, "save", async function () { return this; });
  const created = await tableService.createTable(data);
  assert.ok(created.tableId);
  t.mock.method(Table, "findOne", async () => created);
  t.mock.method(User.prototype, "save", async function () { return this; });
  let existing = null;
  t.mock.method(User, "findOne", () => ({ select: async () => existing }));
  assert.equal((await userService.joinTable({ tableId: created.tableId, name: "a", password: "1234" })).isNewUser, true);
  existing = { name: "a", availableTimes: [], comparePassword: async () => true };
  assert.equal((await userService.joinTable({ tableId: created.tableId, name: "a", password: "1234" })).isNewUser, false);
  assert.equal(counter.mock.callCount(), 3, "카운터 증분은 자동 재시도하지 않음");
  await userService.joinTable({ tableId: created.tableId, name: "a", password: "1234" }, { skipStats: true });
  await tableService.createTable(data, { skipStats: true });
  assert.equal(counter.mock.callCount(), 3);
});

test("업무 저장·인증 실패는 계속 실패하며 통계를 쓰지 않는다", async (t) => {
  const stats = t.mock.method(visitService, "updateVisitStats", async () => {});
  t.mock.method(Table.prototype, "save", async () => { throw new Error("core failed"); });
  await assert.rejects(tableService.createTable(data), /core failed/);
  t.mock.method(Table, "findOne", async () => ({}));
  t.mock.method(User, "findOne", () => ({ select: async () => ({ comparePassword: async () => false }) }));
  await assert.rejects(userService.joinTable({ tableId: "t", name: "a", password: "bad" }), (e) => e.status === 401);
  assert.equal(stats.mock.callCount(), 0);
});

test("늦은 reject도 처리하고 응답 대기 시간을 제한한다", async (t) => {
  t.mock.method(console, "info", () => {});
  t.mock.method(Sentry, "captureMessage", () => {});
  let reject;
  const started = Date.now();
  const result = await runTelemetry("test", () => new Promise((_, fail) => { reject = fail; }), { retry: true, waitMs: 20 });
  assert.equal(result.reason, "timeout");
  assert.ok(Date.now() - started < 200);
  reject(new Error("late failure"));
  await new Promise((resolve) => setImmediate(resolve));
  let attempts = 0;
  const retried = await runTelemetry("idempotent_test", async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("transient");
    return 5;
  }, { retry: true });
  assert.deepEqual(retried, { ok: true, value: 5 });
  assert.equal(attempts, 2);
});
