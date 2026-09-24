// Run with NODE_PATH pointing to an isolated mongodb-memory-server installation.
// Always creates a fresh loopback database; never accepts a database URI.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const Table = require('../models/Table');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Ledger = require('../models/TableActivation');
const tableService = require('../services/tableService');
const userService = require('../services/userService');
const scheduleService = require('../services/scheduleService');
const activation = require('../services/activationService');
const report = require('../services/activationReportService');
const { createSnapshot, participantKey } = require('../utils/activationDefinition');
const { startTestServer } = require('./helpers/testApp');

const data = { title: 'local KPI test', dates: ['2026-09-30', '2026-09-26'], startHour: '09:00', endHour: '24:00', banedCells: ['2026-09-30-10:30'] };
const before = new Date('2026-09-24T00:00:00Z');
const cutoff = new Date('2026-09-30T15:00:00Z');
const now = new Date('2026-10-01T00:00:00Z');
const cell = '2026-09-30-09:00';
let mongo;
test.before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri('activation_test'));
  await Promise.all([Table.init(), Ledger.init(), User.init(), Schedule.init()]);
});
test.after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
test.beforeEach(async () => { await Promise.all([Table.deleteMany({}), Ledger.deleteMany({}), User.deleteMany({}), Schedule.deleteMany({})]); });
const fixture = async (id, overrides = {}, admin = false) => {
  const body = { ...data, ...overrides };
  const table = await Table.create({ ...body, tableId: id, activationSnapshot: createSnapshot(body, before, admin) });
  await activation.recordCreation(table);
  return table;
};
const save = (tableId, name, completedAt = before, availableTimes = [cell]) => activation.recordSchedule({ tableId, name, completedAt, availableTimes });

test('real Mongo: same name concurrently, fourth/late writes, reordered earlier completion retain earliest distinct three', async () => {
  const table = await fixture('concurrent');
  await Promise.all(Array.from({ length: 12 }, () => save('concurrent', 'one', new Date('2026-09-27T00:00:00Z'))));
  assert.equal((await Ledger.findById('concurrent')).participants.length, 1);
  await Promise.all(['two', 'three', 'four'].map((name, i) => save('concurrent', name, new Date(`2026-09-${28 + i}T00:00:00Z`))));
  await save('concurrent', 'earlier', before); // arrives after the other writes
  await save('concurrent', 'one', new Date('2026-09-26T00:00:00Z'));
  const saved = await Ledger.findById('concurrent').lean();
  assert.equal(saved.participants.length, 3);
  const keys = saved.participants.map(p => p.key);
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys.includes(participantKey(table.activationSnapshot, 'earlier')));
  assert.ok(keys.includes(participantKey(table.activationSnapshot, 'two')));
  assert.equal(saved.participants.find(p => p.key === participantKey(table.activationSnapshot, 'one')).firstSavedAt.toISOString(), '2026-09-26T00:00:00.000Z');
  const r = await report.getReport(7, now);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.ended, { total: 1, achieved: 1, incomplete: 0, notAchieved: 0, ratePercent: 100 });
});

test('real Mongo: deadline inclusive, after-deadline/empty/invalid/banned/admin/legacy inputs do not qualify', async () => {
  await fixture('deadline');
  for (const cells of [[], ['bad'], ['2026-09-30-10:30'], ['2026-10-01-09:00']]) await save('deadline', 'invalid', before, cells);
  await save('deadline', 'before-create', new Date(before.getTime() - 1));
  await save('deadline', 'late', new Date(cutoff.getTime() + 1));
  assert.equal((await Ledger.findById('deadline')).participants.length, 0);
  await save('deadline', 'a', before);
  await save('deadline', 'b', before);
  await save('deadline', 'c', cutoff);
  assert.equal((await report.getReport(7, now)).ended.achieved, 1);
  await fixture('admin', {}, true);
  await save('admin', 'ordinary-user');
  await fixture('invalid-date', { dates: ['2026-02-30'] });
  await fixture('past-deadline', { dates: ['2026-01-01'] });
  await Table.create({ ...data, tableId: 'legacy' });
  await save('legacy', 'a');
  assert.equal(await Ledger.countDocuments(), 4);
  const r = await report.getReport(7, now);
  assert.equal(r.ended.total, 1);
  assert.equal(r.quality.excludedAdminTables, 1);
  assert.equal(r.quality.invalidTables, 2);
  assert.equal(r.quality.legacyTables, 1);
});

test('real Mongo: creation deadline remains frozen after admin edits; cancellation/rejoin/clear/deletion never erase achievement', async () => {
  await fixture('history');
  for (const name of ['a', 'b', 'c']) {
    await userService.joinTable({ tableId: 'history', name, password: 'test', availableTimes: [] }, { skipStats: true });
    await save('history', name);
  }
  const beforeDelete = await User.findOne({ tableId: 'history', name: 'a' });
  await userService.deleteUser({ tableId: 'history', name: 'a', password: 'test' });
  await userService.joinTable({ tableId: 'history', name: 'a', password: 'test', availableTimes: [] }, { skipStats: true });
  assert.notEqual((await User.findOne({ tableId: 'history', name: 'a' })).id, beforeDelete.id);
  await save('history', 'a');
  await scheduleService.addSchedule({ tableId: 'history', name: 'a', availableTimes: [] });
  await tableService.updateTable('history', { endHour: '18:00', activationSnapshot: { version: 99 } });
  const r = await report.getReport(7, now);
  assert.equal(r.ended.achieved, 1);
  assert.equal(r.quality.scheduleChangedTables, 1);
  const ledger = await Ledger.findById('history');
  assert.equal(ledger.deadlineAt.toISOString(), cutoff.toISOString());
  assert.equal(ledger.participants.length, 3);
  assert.equal((await Table.findOne({ tableId: 'history' }).select('+activationSnapshot')).activationSnapshot.version, 1);
  await tableService.deleteTable('history');
  assert.equal(await Table.countDocuments(), 0);
  assert.equal((await report.getReport(7, now)).ended.achieved, 1);
});

test('real Mongo: finalized period uses deadline, ongoing separate, no denominator returns null, missing ledgers remain visible', async () => {
  await fixture('ongoing', { dates: ['2026-11-01'] });
  await save('ongoing', 'a', before, ['2026-11-01-09:00']);
  await save('ongoing', 'b', before, ['2026-11-01-09:00']);
  await save('ongoing', 'c', before, ['2026-11-01-09:00']);
  let r = await report.getReport(7, now);
  assert.equal(r.ended.ratePercent, null);
  assert.equal(r.ongoing.total, 1);
  assert.equal(r.ongoing.achieved, 1);
  await fixture('older', { dates: ['2026-09-26'] });
  r = await report.getReport(1, now);
  assert.equal(r.ended.total, 0);
  await fixture('missing');
  await Ledger.deleteOne({ _id: 'missing' }); // simulate collection failure
  r = await report.getReport(7, now);
  assert.equal(r.quality.missingLedgers, 1);
  assert.equal(r.ended.total, 2);
  assert.equal(r.ended.incomplete, 1);
  assert.equal(r.status, 'partial');
  assert.equal(r.ended.ratePercent, null);
  await save('missing', 'a');
  r = await report.getReport(7, now);
  assert.equal(r.quality.missingLedgers, 0);
  assert.equal(r.ended.incomplete, 1, 'recovery cannot invent earlier input history');
  await tableService.deleteTable('missing');
  assert.equal((await report.getReport(7, now)).ended.total, 2);
});

test('real HTTP: old frontend payload collects on server, unchanged response, admin skip and new report authentication', async () => {
  process.env.ADMIN_TOKEN = 'local-activation-test-token';
  const { base, close } = await startTestServer();
  try {
    const request = async (path, body, admin = false) => {
      const res = await fetch(`${base}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(admin ? { 'X-Admin-Mode': 'true' } : {}) }, body: JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
    const created = await request('tables', { ...data, dates: ['2099-01-01'] });
    assert.equal(created.status, 200);
    const { tableId } = created.body.data;
    assert.deepEqual(Object.keys(created.body.data), ['tableId']);
    const pub = await (await fetch(`${base}/api/tables/${tableId}`)).json();
    assert.equal(pub.data.activationSnapshot, undefined);
    const input = { tableId, name: 'creator', password: 'test' };
    assert.equal((await request('users', input)).status, 200);
    assert.equal((await Ledger.findById(tableId)).participants.length, 0, 'name-only registration is not input');
    let result = await request('schedules', { ...input, availableTimes: ['2099-01-01-09:00'] });
    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(result.body.data).sort(), ['scheduleTimeInfo', 'userAvailableTimes']);
    assert.equal((await Ledger.findById(tableId)).participants.length, 1);
    await request('users', { ...input, name: 'admin' }, true);
    result = await request('schedules', { ...input, name: 'admin', availableTimes: ['2099-01-01-09:00'] }, true);
    assert.equal(result.status, 200);
    assert.equal((await Ledger.findById(tableId)).participants.length, 1);
    assert.equal((await fetch(`${base}/api/events/funnels?days=7`)).status, 401);
    const authorized = await fetch(`${base}/api/events/funnels?days=7`, { headers: { 'X-Admin-Token': process.env.ADMIN_TOKEN } });
    const body = await authorized.json();
    assert.equal(authorized.status, 200);
    assert.ok(Array.isArray(body.data.funnels));
    assert.equal(body.data.metricsV2.status, 'ok');
    assert.equal(body.data.metricsV2.ongoing.total, 1);
    assert.ok(!JSON.stringify(body.data.metricsV2).includes('creator'));
  } finally { await close(); }
});

test('real Mongo: same-name saves with different completion times arriving in reverse order preserve the earliest timestamp', async (t) => {
  const table = await fixture('reverse-same-name');
  const original = Ledger.updateOne.bind(Ledger);
  let pendingEarly;
  let startLate;
  const earlyArrived = new Promise(resolve => { startLate = resolve; });
  const early = new Date(before.getTime() + 1000);
  const late = new Date(before.getTime() + 2000);
  t.mock.method(Ledger, 'updateOne', (filter, update, options) => {
    if (!Array.isArray(update)) return original(filter, update, options);
    const time = update[0].$set.participants.$let.in.$let.vars.candidate.firstSavedAt.$min[0];
    if (+time === +early) return new Promise((resolve, reject) => {
      pendingEarly = () => original(filter, update, options).then(resolve, reject);
      startLate();
    });
    return original(filter, update, options).then(result => { pendingEarly(); return result; });
  });
  const earlySave = save('reverse-same-name', 'same', early);
  await earlyArrived;
  await Promise.all([earlySave, save('reverse-same-name', 'same', late)]);
  const saved = await Ledger.findById('reverse-same-name');
  assert.equal(saved.participants.length, 1);
  assert.equal(saved.participants[0].key, participantKey(table.activationSnapshot, 'same'));
  assert.equal(+saved.participants[0].firstSavedAt, +early);
});

test('real Mongo: collection failure after core save is bounded, persistent gap hides rate and retries do not repeat business writes', async (t) => {
  await fixture('failure', { dates: ['2099-01-01'] });
  await userService.joinTable({ tableId: 'failure', name: 'a', password: 'test' }, { skipStats: true });
  const original = Ledger.updateOne.bind(Ledger);
  let failures = 0;
  const spy = t.mock.method(Ledger, 'updateOne', (filter, update, options) => {
    if (update.$setOnInsert) { failures++; throw new Error('injected ledger fault'); }
    return original(filter, update, options);
  });
  const result = await scheduleService.addSchedule({ tableId: 'failure', name: 'a', availableTimes: ['2099-01-01-09:00'] });
  assert.deepEqual(result.userAvailableTimes, ['2099-01-01-09:00']);
  assert.equal(failures, 2);
  assert.equal((await Ledger.findById('failure')).incomplete, true);
  spy.mock.restore();
  assert.equal((await report.getReport(7, now)).status, 'partial');
});
