const test = require("node:test");
const assert = require("node:assert/strict");
const Table = require("../models/Table");
const Event = require("../models/Event");
const { recordEvent } = require("../services/eventService");
const { FUNNELS, MATURITY_FUNNEL } = require("../utils/funnels");
const { startTestServer } = require("./helpers/testApp");

// 2026-09-29 테이블 A/B: 표 이벤트에 그때 보던 화면(A/B)을 붙이고, 화면 전환은 ui_switch로 남긴다.
const TABLE_EVENTS = ["create_success", "invite_share", "table_view", "join_submit", "join_success",
  "schedule_save", "ranking_open", "ui_switch"];

test("표 이벤트에만 A·B 화면을 저장하고, 모르는 값·다른 이벤트는 버린다", async (t) => {
  t.mock.method(Table, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  t.mock.method(Event, "create", async (data) => data);
  for (const name of TABLE_EVENTS) {
    for (const uiVersion of ["A", "B"]) {
      const event = await recordEvent({ name, visitorId: "v", tableId: "t", uiVersion });
      assert.equal(event.uiVersion, uiVersion, `${name}에 ${uiVersion}를 저장한다`);
    }
  }
  for (const uiVersion of [undefined, "", "a", "C", { $ne: null }, ["A"]]) {
    const event = await recordEvent({ name: "schedule_save", visitorId: "v", tableId: "t", uiVersion });
    assert.equal(event.uiVersion, undefined);
  }
  for (const name of ["landing_view", "create_view", "create_submit"]) {
    const event = await recordEvent({ name, visitorId: "v", tableId: "t", uiVersion: "B" });
    assert.equal(event.uiVersion, undefined, `${name}에는 화면을 두지 않는다`);
  }
});

test("ui_switch는 표와 바꾼 화면이 모두 있어야 저장한다", async (t) => {
  t.mock.method(Table, "findOne", () => ({ select: () => ({ lean: async () => ({ creatorVisitorId: "v" }) }) }));
  const created = t.mock.method(Event, "create", async (data) => data);
  assert.equal(await recordEvent({ name: "ui_switch", visitorId: "v", uiVersion: "B" }), null);
  assert.equal(await recordEvent({ name: "ui_switch", visitorId: "v", tableId: "t" }), null);
  assert.equal(await recordEvent({ name: "ui_switch", visitorId: "v", tableId: "t", uiVersion: "b" }), null);
  assert.equal(created.mock.callCount(), 0);

  const event = await recordEvent({ name: "ui_switch", visitorId: "v", tableId: "t", uiVersion: "B" });
  assert.equal(event.name, "ui_switch");
  assert.equal(event.uiVersion, "B");
  // 다른 표 이벤트처럼 만든 사람·참여자 구분을 붙인다.
  assert.equal(event.tableRole, "creator");
});

test("ui_switch는 어느 퍼널 단계에도 들어가지 않는다", () => {
  const steps = [...FUNNELS.flatMap((funnel) => funnel.steps), ...MATURITY_FUNNEL.steps].map((step) => step.event);
  assert.ok(!steps.includes("ui_switch"));
});

test("POST /api/events가 화면 전환을 받아 저장하고, 응답 형식은 그대로다", async (t) => {
  t.mock.method(Table, "findOne", () => ({ select: () => ({ lean: async () => ({ creatorVisitorId: "other" }) }) }));
  const events = t.mock.method(Event, "create", async (data) => data);
  const { base, close } = await startTestServer();
  t.after(close);
  const post = (body) => fetch(`${base}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => res.json());

  assert.deepEqual(
    await post({ name: "ui_switch", visitorId: "v", tableId: "t", uiVersion: "A", device: "mobile" }),
    { success: true, tableRole: "participant" },
  );
  assert.equal(events.mock.calls[0].arguments[0].uiVersion, "A");
  // 화면이 빠진 전환 기록은 저장하지 않지만 응답은 옛 규칙(모르는 이름)처럼 200이다.
  assert.deepEqual(await post({ name: "ui_switch", visitorId: "v", tableId: "t" }), { success: true });
  assert.equal(events.mock.callCount(), 1);
});
