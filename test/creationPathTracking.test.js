const test = require("node:test");
const assert = require("node:assert/strict");
const Table = require("../models/Table");
const Event = require("../models/Event");
const { recordEvent } = require("../services/eventService");
const { startTestServer } = require("./helpers/testApp");

// 2026-09-29 랜딩 A/B: 생성 퍼널 이벤트에 생성 경로를 함께 저장해 랜딩 생성과 빠른 생성을 나눈다.
test("생성 퍼널 이벤트에만 알려진 생성 경로를 저장하고, 나머지는 버린다", async (t) => {
  t.mock.method(Table, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  t.mock.method(Event, "create", async (data) => data);
  for (const name of ["create_view", "create_cta_click", "create_submit", "create_success"]) {
    for (const path of ["landing", "quick_create"]) {
      const event = await recordEvent({ name, visitorId: "v", tableId: "t", creationPath: path });
      assert.equal(event.creationPath, path);
    }
  }
  for (const creationPath of [undefined, "", "other", { $ne: null }, ["landing"]]) {
    const event = await recordEvent({ name: "create_success", visitorId: "v", tableId: "t", creationPath });
    assert.equal(event.creationPath, undefined);
  }
  for (const name of ["landing_view", "invite_share", "table_view"]) {
    const event = await recordEvent({ name, visitorId: "v", tableId: "t", creationPath: "landing" });
    assert.equal(event.creationPath, undefined, `${name}에는 생성 경로를 두지 않는다`);
  }
});

test("POST /api/events가 생성 경로를 받아 저장하고, 응답 형식은 그대로다", async (t) => {
  t.mock.method(Table, "findOne", () => ({ select: () => ({ lean: async () => ({ creatorVisitorId: "v" }) }) }));
  const events = t.mock.method(Event, "create", async (data) => data);
  const { base, close } = await startTestServer();
  t.after(close);
  const res = await fetch(`${base}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "create_success", visitorId: "v", tableId: "t", creationPath: "landing", device: "desktop" }),
  });
  assert.deepEqual(await res.json(), { success: true, tableRole: "creator" });
  assert.equal(events.mock.calls[0].arguments[0].creationPath, "landing");
});
