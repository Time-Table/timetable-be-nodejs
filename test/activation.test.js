const test = require("node:test");
const assert = require("node:assert/strict");
const { createSnapshot, hasValidCell, participantKey } = require("../utils/activationDefinition");
const activationService = require("../services/activationService");
const scheduleService = require("../services/scheduleService");
const User = require("../models/User");
const Schedule = require("../models/Schedule");
const Table = require("../models/Table");
const TableActivation = require("../models/TableActivation");
const eventService = require("../services/eventService");
const activationReportService = require("../services/activationReportService");
const participationReportService = require("../services/participationReportService");
const { getFunnels } = require("../controllers/eventController");
const data = { dates: ["2026-09-26", "2026-09-25"], startHour: "09:00", endHour: "24:00", banedCells: ["2026-09-26-10:30"] };
const createdAt = new Date("2026-09-24T00:00:00Z");

test("최대 후보일·한국시간·24시와 잘못된 기간을 구분한다", () => {
  const snapshot = createSnapshot(data, createdAt);
  assert.equal(snapshot.deadlineAt.toISOString(), "2026-09-26T15:00:00.000Z");
  assert.equal(snapshot.excludedReason, null);
  for (const dates of [[], ["2026-02-30"], ["2026-01-01"], ["bad"]]) {
    assert.equal(createSnapshot({ ...data, dates }, createdAt).excludedReason, "invalid_period");
  }
  assert.equal(createSnapshot(data, createdAt, true).excludedReason, "admin");
  assert.equal(createSnapshot({ ...data, endHour: "09:00" }, createdAt).excludedReason, "invalid_period");
});

test("빈 입력·임의 문자열·금지 셀·범위 밖은 제외하고 실제 셀만 인정한다", () => {
  for (const cells of [[], ["bad"], ["2026-09-26-24:00"], ["2026-09-26-08:30"], ["2026-09-26-10:15"], ["2026-09-26-10:30"], ["2026-09-27-09:00"]]) {
    assert.equal(hasValidCell(data, cells), false, JSON.stringify(cells));
  }
  assert.equal(hasValidCell(data, ["invalid", "2026-09-26-23:30"]), true);
  const snapshot = createSnapshot(data, createdAt);
  assert.equal(participantKey(snapshot, "same"), participantKey(snapshot, "same"));
  assert.notEqual(participantKey(snapshot, "same"), participantKey(createSnapshot(data, createdAt), "same"));
});

test("전체 일정 저장 성공 이후에만 기록하며 관리자 입력은 제외한다", async (t) => {
  t.mock.method(User, "findOneAndUpdate", async () => ({ availableTimes: ["2026-09-26-09:00"] }));
  t.mock.method(User, "find", async () => []);
  let fail = true;
  t.mock.method(Schedule, "findOneAndUpdate", async () => { if (fail) throw new Error("schedule failure"); });
  const metric = t.mock.method(activationService, "recordSchedule", async (value) => {
    assert.ok(value.completedAt instanceof Date);
    assert.deepEqual(value.availableTimes, ["2026-09-26-09:00"]);
  });
  const input = { tableId: "t", name: "a", availableTimes: ["2026-09-26-09:00"] };
  await assert.rejects(scheduleService.addSchedule(input), /schedule failure/);
  assert.equal(metric.mock.callCount(), 0);
  fail = false;
  const result = await scheduleService.addSchedule(input);
  assert.deepEqual(result, { userAvailableTimes: input.availableTimes, scheduleTimeInfo: [] });
  await scheduleService.addSchedule(input, { skipStats: true });
  assert.equal(metric.mock.callCount(), 1);
});

test("새 메타데이터는 공개 직렬화에서 제외되며 TTL을 적용하지 않는다", () => {
  const table = new Table({ title: "t", tableId: "t", ...data, activationSnapshot: createSnapshot(data, createdAt) });
  assert.equal(table.toJSON().activationSnapshot, undefined);
  assert.equal(Table.schema.path("activationSnapshot").options.select, false);
  assert.ok(TableActivation.schema.indexes().every(([, options]) => !options.expireAfterSeconds));
});

test("지표 조회 실패도 기존 퍼널 응답·성공 코드를 유지한다", async (t) => {
  t.mock.method(console, "info", () => {});
  const legacy = { funnels: [{ key: "creation", entered: 2 }], startDate: "2026-09-01" };
  t.mock.method(eventService, "getFunnelReport", async () => legacy);
  t.mock.method(activationReportService, "getReport", async () => { throw new Error("v2 offline"); });
  t.mock.method(participationReportService, "getReport", async () => ({ version: 1, status: "ok" }));
  let status, body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  await getFunnels({ query: { days: "30" } }, res);
  assert.equal(status, 200);
  assert.deepEqual(body.data.funnels, legacy.funnels);
  assert.deepEqual(body.data.metricsV2, { version: 1, status: "unavailable" });
  assert.deepEqual(body.data.participationMetrics, { version: 1, status: "ok" });
});

test("참여 KPI 조회 실패는 기존 입력 지표와 퍼널에 전파하지 않는다", async (t) => {
  t.mock.method(console, "info", () => {});
  t.mock.method(eventService, "getFunnelReport", async () => ({ funnels: [{ key: "creation" }] }));
  t.mock.method(activationReportService, "getReport", async () => ({ version: 1, status: "ok" }));
  t.mock.method(participationReportService, "getReport", async () => { throw new Error("legacy offline"); });
  let status, body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  await getFunnels({ query: { days: "30" } }, res);
  assert.equal(status, 200);
  assert.deepEqual(body.data.funnels, [{ key: "creation" }]);
  assert.equal(body.data.metricsV2.status, "ok");
  assert.deepEqual(body.data.participationMetrics, { version: 1, status: "unavailable" });
});
