// Local Mongo only, same harness as activation.integration.cjs; no external URI accepted.
const test = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const Table = require("../models/Table");
const User = require("../models/User");
const DeletedUser = require("../models/DeletedUser");
const Ledger = require("../models/TableActivation");
const { getReport } = require("../services/participationReportService");
const { startTestServer } = require("./helpers/testApp");

const createdAt = new Date("2026-09-20T00:00:00Z");
const cutoff = new Date("2026-09-25T15:00:00Z");
const now = new Date("2026-09-26T01:00:00Z");
let mongo;
test.before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri("legacy_participation_test"));
  await Table.init();
});
test.after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
test.beforeEach(async () => {
  await Promise.all([Table.deleteMany({}), User.deleteMany({}), DeletedUser.deleteMany({}), Ledger.deleteMany({})]);
});
const table = (tableId, extra = {}) => Table.collection.insertOne({
  tableId, title: "local only", dates: ["2026-09-25", "2026-09-24"], startHour: "09:00", endHour: "24:00", createdAt, ...extra,
});
const join = (tableId, name, when = createdAt, extra = {}) => User.collection.insertOne({
  tableId, name, createdAt: when, availableTimes: [], ...extra,
});

test("legacy: empty schedules qualify, distinct names only, creation/deadline inclusive, late and pre-creation excluded", async () => {
  await table("met");
  await join("met", "a");
  await join("met", "b", new Date("2026-09-23T00:00:00Z")); // before first candidate date
  await join("met", "c", cutoff);
  await table("not-met");
  await join("not-met", "a");
  await join("not-met", "a", cutoff); // duplicate stored record cannot become third person
  await join("not-met", "b", cutoff);
  await join("not-met", "late", new Date(+cutoff + 1));
  await join("not-met", "early", new Date(+createdAt - 1));
  await join("not-met", "missing", null);
  await join("not-met", "wrong-type", cutoff.toISOString());
  await join("not-met", "", cutoff);
  const report = await getReport(7, now);
  assert.deepEqual(report.ended, { total: 2, achieved: 1, notAchieved: 1, incomplete: 0, ratePercent: 50 });
  assert.equal(report.period.basis, "deadline");
  assert.equal(report.quality.invalidTables, 0);
});

test("legacy: cancellation/deletion not reconstructed, admin tables excluded and no source writes", async () => {
  await table("surviving");
  await table("new", { activationSnapshot: { version: 1, excludedReason: "admin" } });
  for (const id of ["surviving", "orphan", "new"]) for (const name of ["a", "b", "c"]) await join(id, name);
  await User.deleteOne({ tableId: "surviving", name: "c" });
  await DeletedUser.collection.insertOne({ tableId: "surviving", name: "c", createdAt });
  const before = JSON.stringify(await Promise.all([Table.find().lean(), User.find().lean(), DeletedUser.find().lean()]));
  const report = await getReport(7, now);
  assert.deepEqual(report.ended, { total: 1, achieved: 0, notAchieved: 1, incomplete: 0, ratePercent: 0 });
  assert.equal(await Ledger.countDocuments(), 0);
  assert.equal(JSON.stringify(await Promise.all([Table.find().lean(), User.find().lean(), DeletedUser.find().lean()])), before);
});

test("legacy: KST deadline periods, ongoing independent of period, future joins not counted, current edited deadline used", async () => {
  await table("old", { dates: ["2026-09-21"], endHour: "12:00" });
  await table("ended");
  await table("ongoing", { dates: ["2026-10-01"] });
  for (const name of ["a", "b", "c"]) await join("ongoing", name, new Date(+now + 1));
  let report = await getReport(1, now);
  assert.equal(report.ended.total, 1); // 25th 24:00 is 26th KST 00:00, included in today's period.
  assert.equal(report.ongoing.total, 1);
  assert.equal(report.ongoing.achieved, 0);
  report = await getReport(7, now);
  assert.equal(report.ended.total, 2);
  await Table.updateOne({ tableId: "ended" }, { $set: { dates: ["2026-10-02"] } });
  report = await getReport(7, now);
  assert.equal(report.ended.total, 1);
  assert.equal(report.ongoing.total, 2);
  report = await getReport(1, new Date("2026-09-27T01:00:00Z"));
  assert.equal(report.ended.ratePercent, null);
  assert.equal(report.ongoing.total, 2);
});

test("legacy: invalid/missing periods are excluded; empty cohort returns null rate and bounded days", async () => {
  for (const [id, extra] of [
    ["bad-day", { dates: ["2026-02-30"] }], ["no-days", { dates: [] }],
    ["bad-hour", { endHour: "24:01" }], ["no-created", { createdAt: null }],
    ["past", { dates: ["2026-01-01"] }], ["future-created", { createdAt: new Date("2099-01-01") }],
  ]) await table(id, extra);
  const report = await getReport(9999, now);
  assert.equal(report.quality.invalidTables, 6);
  assert.equal(report.period.days, 3660);
  assert.deepEqual(report.ended, { total: 0, achieved: 0, notAchieved: 0, incomplete: 0, ratePercent: null });
  assert.equal((await getReport(0, now)).period.startAt, null);
});

test("legacy: authenticated API returns only aggregate fields alongside existing metrics", async () => {
  process.env.ADMIN_TOKEN = "local-legacy-test-token";
  await table("private-table");
  for (const name of ["private-a", "private-b", "private-c"]) await join("private-table", name);
  const { base, close } = await startTestServer();
  try {
    assert.equal((await fetch(`${base}/api/events/funnels`)).status, 401);
    const res = await fetch(`${base}/api/events/funnels`, { headers: { "X-Admin-Token": process.env.ADMIN_TOKEN } });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.participationMetrics.status, "ok");
    assert.equal(body.data.metricsV2.status, "ok");
    assert.ok(Array.isArray(body.data.funnels));
    assert.ok(!JSON.stringify(body.data.participationMetrics).includes("private-"));
  } finally { await close(); }
});

const activation = require('../services/activationService');
const { createSnapshot } = require('../utils/activationDefinition');
const userService = require('../services/userService');
const tableService = require('../services/tableService');
const data = { title:'current registration fixture',dates:['2026-09-25'],startHour:'09:00',endHour:'24:00',banedCells:[] };

test('current: actual joins without input qualify; cancellation and table deletion update the report while input ledger is preserved', async () => {
  const body = { ...data, dates: ['2099-01-01'] };
  const doc = await Table.create({ ...body, tableId:'joins', createdAt, activationSnapshot:createSnapshot(body,createdAt) });
  await activation.recordCreation(doc);
  for (const name of ['a','b','c']) await userService.joinTable({tableId:'joins',name,password:'local-test'});
  assert.ok((await User.find({tableId:'joins'})).every(u=>u.availableTimes.length===0));
  assert.equal((await Ledger.findById('joins')).participants.length,0,'registration does not change existing input telemetry');
  assert.equal((await getReport(0,new Date())).ongoing.achieved,1);
  await userService.joinTable({tableId:'joins',name:'a',password:'local-test'});
  assert.equal(await User.countDocuments({tableId:'joins'}),3,'login is not a fourth participant');
  await userService.deleteUser({tableId:'joins',name:'a',password:'local-test'});
  assert.equal((await getReport(0,new Date())).ongoing.achieved,0);
  const ledgerBefore = JSON.stringify(await Ledger.find().lean());
  await tableService.deleteTable('joins');
  const r=await getReport(0,new Date());
  assert.equal(r.quality.existingTables,0);
  assert.equal(JSON.stringify(await Ledger.find().lean()),ledgerBefore);
});

test('current: all snapshot versions respond to cancellation, late rejoin, deadline edit and deletion without rewriting ledgers', async () => {
  for (const version of [null, 1, 2]) {
    const id = `current-${version}`;
    await table(id, version ? { activationSnapshot: { ...createSnapshot(data,createdAt), version } } : {});
    for (const name of ['a','b','c']) await join(id,name,cutoff);
  }
  await Ledger.collection.insertOne({ _id: 'deleted-history', version: 2, createdAt, deadlineAt: cutoff,
    registrations: ['a','b','c'].map(key => ({ key, firstRegisteredAt: cutoff })) });
  const ledgerBefore = JSON.stringify(await Ledger.find().lean());
  let r = await getReport(0,now);
  assert.equal(r.definition,'current_registration_before_deadline');
  assert.equal(r.ended.achieved,3);
  assert.equal(r.quality.existingTables,3);
  for (const version of [null,1,2]) {
    const id = `current-${version}`;
    await User.deleteOne({tableId:id,name:'c'});
    await join(id,'c',new Date(+cutoff+1));
  }
  r = await getReport(0,now);
  assert.equal(r.ended.achieved,0,'cancelled participants are not restored; late rejoin excluded');
  await Table.updateMany({},{$set:{dates:['2026-09-26'],endHour:'24:00'}});
  r = await getReport(0,now);
  assert.equal(r.ended.total,0);
  assert.equal(r.ongoing.achieved,3,'current deadline replaces snapshot deadline for every version');
  await Table.deleteMany({});
  r = await getReport(0,now);
  assert.equal(r.quality.existingTables,0);
  assert.equal(r.ended.total+r.ongoing.total,0,'orphan users and deleted-table ledgers excluded');
  assert.equal(JSON.stringify(await Ledger.find().lean()),ledgerBefore);
});

test('current: corrected live deadline overrides historical invalid snapshot reason', async () => {
  await table('corrected',{activationSnapshot:{version:2,createdAt,deadlineAt:new Date('2020-01-01'),excludedReason:'invalid_deadline'}});
  for(const name of ['a','b','c']) await join('corrected',name);
  const report=await getReport(0,now);
  assert.equal(report.ended.achieved,1);
  assert.equal(report.quality.invalidTables,0);
});
