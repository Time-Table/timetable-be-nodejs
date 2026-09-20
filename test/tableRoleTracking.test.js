const test = require("node:test");
const assert = require("node:assert/strict");
const Table = require("../models/Table");
const Event = require("../models/Event");
const visitService = require("../services/visitService");
const tableService = require("../services/tableService");
const { recordEvent } = require("../services/eventService");
const { startTestServer } = require("./helpers/testApp");

const tableData = { title: "테스트", dates: ["2026-09-25"], startHour: "09:00", endHour: "18:00", banedCells: [] };

test("같은 브라우저도 표마다 생성/참여 역할을 구분하고 기기를 함께 저장한다", async (t) => {
  const owners = { a: "browser-a", b: "browser-b" };
  t.mock.method(Table, "findOne", ({ tableId }) => ({
    select: (projection) => {
      assert.equal(projection, "+creatorVisitorId");
      return { lean: async () => ({ creatorVisitorId: owners[tableId] }) };
    },
  }));
  t.mock.method(Event, "create", async (data) => data);
  for (const name of ["create_success", "table_view", "join_success", "schedule_save"]) {
    const own = await recordEvent({ name, visitorId: "browser-a", tableId: "a", device: "desktop" });
    assert.equal(own.tableRole, "creator");
    assert.equal(own.device, "desktop");
    const invited = await recordEvent({ name, visitorId: "browser-a", tableId: "b", device: "mobile", tableRole: "creator" });
    assert.equal(invited.tableRole, "participant", "클라이언트가 주장한 역할을 믿지 않는다");
    assert.equal(invited.tableId, "b");
    assert.equal(invited.device, "mobile");
  }
});

test("기존 표·삭제된 표·조회 오류는 참여자로 추측하지 않고 unknown을 저장한다", async (t) => {
  let found;
  t.mock.method(Table, "findOne", () => ({ select: () => ({ lean: async () => {
    if (found instanceof Error) throw found;
    return found;
  } }) }));
  t.mock.method(Event, "create", async (data) => data);
  for (const value of [{}, null, new Error("lookup failed")]) {
    found = value;
    const event = await recordEvent({ name: "table_view", visitorId: "visitor", tableId: "legacy" });
    assert.equal(event.tableRole, "unknown");
  }
});

test("잘못된 ID는 역할 조회에 넘기지 않으며 표 없는 이벤트에는 역할을 만들지 않는다", async (t) => {
  const lookup = t.mock.method(Table, "findOne", () => { throw new Error("조회하면 안 됨"); });
  const save = t.mock.method(Event, "create", async (data) => data);
  for (const visitorId of [undefined, "", 123, {}, "a".repeat(65)]) {
    assert.equal(await recordEvent({ name: "table_view", visitorId, tableId: "a" }), null);
  }
  assert.equal(save.mock.callCount(), 0);
  for (const tableId of [undefined, "", { $ne: null }, "a".repeat(65)]) {
    const event = await recordEvent({ name: "table_view", visitorId: "v", tableId });
    assert.equal(event.tableRole, "unknown");
    assert.equal(event.tableId, undefined);
  }
  const landing = await recordEvent({ name: "landing_view", visitorId: "v" });
  assert.equal(landing.tableRole, undefined);
  assert.equal(lookup.mock.callCount(), 0);
});

test("생성 ID는 선택사항이며 관리자·잘못된 값은 생성 기능에 영향 없이 제외한다", async (t) => {
  t.mock.method(Table.prototype, "save", async function () { return this; });
  const stats = t.mock.method(visitService, "updateVisitStats", async () => {});
  const created = await tableService.createTable({ ...tableData, creatorVisitorId: "browser-a" });
  assert.equal(created.creatorVisitorId, "browser-a");
  assert.equal(created.toJSON().creatorVisitorId, undefined, "응답 직렬화에서 식별자 제거");
  assert.equal(Table.schema.path("creatorVisitorId").options.select, false);
  created.isNew = false;
  created.creatorVisitorId = "another-browser";
  assert.equal(created.creatorVisitorId, "browser-a", "생성 후 변경 불가");
  for (const creatorVisitorId of [undefined, "", 123, {}, "a".repeat(65)]) {
    const table = await tableService.createTable({ ...tableData, creatorVisitorId });
    assert.equal(table.creatorVisitorId, undefined);
    assert.ok(table.tableId);
  }
  const before = stats.mock.callCount();
  const admin = await tableService.createTable({ ...tableData, creatorVisitorId: "admin" }, { skipStats: true });
  assert.equal(admin.creatorVisitorId, undefined);
  assert.equal(stats.mock.callCount(), before);
});

test("실제 HTTP 경계에서 생성 ID를 전달하고 이벤트 응답은 역할만 노출한다", async (t) => {
  t.mock.method(Table.prototype, "save", async function () { return this; });
  t.mock.method(visitService, "updateVisitStats", async () => {});
  const create = t.mock.method(tableService, "createTable", async (data, options) => {
    assert.equal(data.creatorVisitorId, "browser-a");
    assert.equal(options.skipStats, false);
    return { tableId: "test-table", creatorVisitorId: "browser-a" };
  });
  t.mock.method(Table, "findOne", () => ({ select: () => ({ lean: async () => ({ creatorVisitorId: "browser-a" }) }) }));
  const events = t.mock.method(Event, "create", async (data) => data);
  const { base, close } = await startTestServer();
  t.after(close);
  const post = (path, body, headers = {}) => fetch(`${base}/api/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  const table = await post("tables", { ...tableData, creatorVisitorId: "browser-a" });
  assert.equal(table.status, 200);
  assert.deepEqual((await table.json()).data, { tableId: "test-table" });
  assert.equal(create.mock.callCount(), 1);
  const event = await post("events", { name: "join_success", visitorId: "browser-b", tableId: "test-table", tableRole: "creator", device: "mobile" });
  assert.deepEqual(await event.json(), { success: true, tableRole: "participant" });
  assert.equal(events.mock.calls[0].arguments[0].device, "mobile");
  const admin = await post("events", { name: "table_view", visitorId: "browser-a", tableId: "test-table" }, { "X-Admin-Mode": "true" });
  assert.deepEqual(await admin.json(), { success: true, skipped: true });
  assert.equal(events.mock.callCount(), 1);
});
