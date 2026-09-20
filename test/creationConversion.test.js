const test = require("node:test");
const assert = require("node:assert/strict");
const Event = require("../models/Event");
const Table = require("../models/Table");
const User = require("../models/User");
const { getFunnelReport } = require("../services/eventService");

test("랜딩 직접 생성과 빠른 생성 모두 성공으로 세고 클릭·실패·직접 진입은 분리한다", async (t) => {
  // DB 연결 없이 집계 경계를 검증한다. route 자체는 Event에 저장되지 않는다.
  t.mock.method(Event, "aggregate", async () => [
    { _id: "landing", events: ["landing_view", "create_submit", "create_success"] },
    { _id: "quick", events: ["landing_view", "create_cta_click", "create_view", "create_submit", "create_success"] },
    { _id: "failed", events: ["landing_view", "create_submit"] },
    { _id: "click-only", events: ["landing_view", "create_cta_click"] },
    { _id: "direct-quick", events: ["create_view", "create_success"] },
  ]);
  t.mock.method(Table, "find", () => ({ lean: async () => [] }));
  t.mock.method(User, "aggregate", async () => []);
  const report = await getFunnelReport(30);
  const funnel = report.funnels.find((f) => f.key === "creation");
  assert.equal(funnel.entered, 4);
  assert.equal(funnel.finished, 2);
  assert.equal(funnel.overallConversion, 50);
  assert.equal(funnel.steps.at(-1).event, "create_success");
  assert.equal(funnel.steps.at(-1).reached, 3);
  assert.equal(report.funnels.find((f) => f.key === "sharing").entered, 3);
});

test("기록이 없는 생성 퍼널은 0이며 NaN을 반환하지 않는다", async (t) => {
  t.mock.method(Event, "aggregate", async () => []);
  t.mock.method(Table, "find", () => ({ lean: async () => [] }));
  t.mock.method(User, "aggregate", async () => []);
  const report = await getFunnelReport(30);
  const funnel = report.funnels.find((f) => f.key === "creation");
  assert.equal(funnel.entered, 0);
  assert.equal(funnel.finished, 0);
  assert.equal(funnel.overallConversion, 0);
});
