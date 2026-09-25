// Disposable loopback replica set only. No external database URI is accepted.
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Table = require('../models/Table');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const DeletedUser = require('../models/DeletedUser');
const Chat = require('../models/Chat');
const Ledger = require('../models/TableActivation');
const Visiter = require('../models/Visiter');
const Event = require('../models/Event');
const tables = require('../services/tableService');
const users = require('../services/userService');
const schedules = require('../services/scheduleService');
const chats = require('../services/chatService');
const visits = require('../services/visitService');
const { startTestServer } = require('./helpers/testApp');
const models = [Table, User, Schedule, DeletedUser, Chat, Ledger, Visiter, Event];
const children = [User, Schedule, DeletedUser, Chat];
const cell = '2099-01-01-09:00';
let mongo;
test.before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri('cascade_test'));
  await Promise.all(models.map(model => model.init()));
});
test.after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
test.beforeEach(async () => { await Promise.all(models.map(model => model.deleteMany({}))); });
const fixture = async tableId => {
  await Table.create({ tableId, title: 'disposable local fixture', dates: ['2099-01-01'], startHour: '09:00', endHour: '18:00' });
  await User.create({ tableId, name: 'same-name', password: 'local-only', availableTimes: [cell] });
  await Schedule.create({ tableId, timeInfo: [{ time: cell, colorNumber: 1, count: 1, members: ['same-name'] }] });
  await DeletedUser.create({ tableId, name: 'cancelled', userId: 'local-user', availableTimes: [cell] });
  await Chat.create({ tableId, chats: [{ name: 'same-name', message: 'local only', timestamp: new Date() }] });
};
const stored = async (model, filter = {}) => JSON.stringify(await model.collection.find(filter).sort({ _id: 1 }).toArray());
const assertGone = async tableId => {
  for (const model of [Table, ...children]) assert.equal(await model.countDocuments({ tableId }), 0, model.modelName);
};

test('admin deletion removes only selected table and all four child collections, preserves counters/events/ledger', async () => {
  await fixture('target'); await fixture('other');
  await Ledger.create({ _id: 'target', version: 1, participants: [{ key: 'pseudonym', firstSavedAt: new Date() }] });
  await Visiter.create({ date: '2099-01-01', totalTableCreateCount: 402, totalSignUp: 600 });
  await Event.create({ tableId: 'target', name: 'join_success', visitorId: 'local' });
  const preserved = [Ledger, Visiter, Event];
  const before = await Promise.all(preserved.map(model => stored(model)));
  const other = await Promise.all([Table, ...children].map(model => stored(model, { tableId: 'other' })));
  process.env.ADMIN_TOKEN = 'local-cascade-admin';
  const server = await startTestServer();
  try {
    const denied = await fetch(`${server.base}/api/tables/target`, { method: 'DELETE' });
    assert.equal(denied.status, 401); assert.equal(await Table.countDocuments({ tableId: 'target' }), 1);
    const response = await fetch(`${server.base}/api/tables/target`, { method: 'DELETE', headers: { 'X-Admin-Token': 'local-cascade-admin' } });
    assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
    await assertGone('target');
    assert.deepEqual(await Promise.all(preserved.map(model => stored(model))), before);
    assert.deepEqual(await Promise.all([Table, ...children].map(model => stored(model, { tableId: 'other' }))), other);
    const repeat = await fetch(`${server.base}/api/tables/target`, { method: 'DELETE', headers: { 'X-Admin-Token': 'local-cascade-admin' } });
    assert.equal(repeat.status, 404);
  } finally { await server.close(); delete process.env.ADMIN_TOKEN; }
});

test('failure after partial child deletes rolls back every collection', async t => {
  await fixture('rollback');
  const before = await Promise.all([Table, ...children].map(model => stored(model)));
  t.mock.method(DeletedUser, 'deleteMany', async () => { throw new Error('injected local failure'); });
  await assert.rejects(tables.deleteTable('rollback'), /injected local failure/);
  assert.deepEqual(await Promise.all([Table, ...children].map(model => stored(model))), before);
});

test('missing table does not silently clean up historical orphan records', async () => {
  await Chat.create({ tableId: 'old-orphan', chats: [] });
  assert.equal(await tables.deleteTable('old-orphan'), null);
  assert.equal(await Chat.countDocuments({ tableId: 'old-orphan' }), 1);
});

const writes = {
  join: id => users.joinTable({ tableId: id, name: 'new-person', password: 'local-only' }, { skipStats: true }),
  cancel: id => users.deleteUser({ tableId: id, name: 'same-name', password: 'local-only' }),
  save: id => schedules.addSchedule({ tableId: id, name: 'same-name', availableTimes: [cell] }, { skipStats: true }),
  regenerate: id => schedules.generateSchedule(id),
  chat: id => chats.postChat({ tableId: id, name: 'same-name', message: 'concurrent' }),
};
for (const [name, write] of Object.entries(writes)) {
  test(`delete overlaps ${name}: committed write is removed; later writes cannot recreate children`, async t => {
    await fixture('race');
    let entered, release;
    const ready = new Promise(resolve => { entered = resolve; });
    const hold = new Promise(resolve => { release = resolve; });
    const original = Table.updateOne.bind(Table);
    let held = false;
    t.mock.method(Table, 'updateOne', async (...args) => {
      const result = await original(...args);
      if (!held) { held = true; entered(); await hold; }
      return result;
    });
    const writing = write('race');
    await ready;
    let deleteAttempted;
    const deletionStarted = new Promise(resolve => { deleteAttempted = resolve; });
    const originalDelete = Table.findOneAndDelete.bind(Table);
    t.mock.method(Table, 'findOneAndDelete', (...args) => { deleteAttempted(); return originalDelete(...args); });
    const deleting = tables.deleteTable('race');
    await deletionStarted;
    release();
    await Promise.all([writing, deleting]);
    await assertGone('race');
    await assert.rejects(write('race'), error => error.status === 404);
    await assertGone('race');
  });
}

test('normal join/login/password failure/save/chat/cancel work; parent timestamps and telemetry counts remain correct', async t => {
  await fixture('normal');
  const before = await Table.findOne({ tableId: 'normal' }).lean();
  const counter = t.mock.method(visits, 'updateVisitStats', async () => {});
  const data = { tableId: 'normal', name: 'new-person', password: 'local-only' };
  assert.equal((await users.joinTable(data)).isNewUser, true);
  assert.equal((await users.joinTable(data)).isNewUser, false);
  await assert.rejects(users.joinTable({ ...data, password: 'wrong' }), error => error.status === 401);
  assert.equal(counter.mock.callCount(), 2);
  assert.deepEqual(counter.mock.calls.map(call => call.arguments[0]), [{ todaySignUp: 1, totalSignUp: 1 }, { todayLogin: 1, totalLogin: 1 }]);
  const saved = await schedules.addSchedule({ ...data, availableTimes: [cell, cell] }, { skipStats: true });
  assert.deepEqual(saved.userAvailableTimes, [cell]);
  assert.ok(saved.scheduleTimeInfo.some(row => row.members.includes('new-person')));
  await chats.postChat({ ...data, message: 'hello' });
  assert.equal((await chats.getChats('normal')).length, 2);
  await users.deleteUser(data);
  assert.equal(await User.countDocuments({ tableId: 'normal', name: data.name }), 0);
  assert.equal(await DeletedUser.countDocuments({ tableId: 'normal', name: data.name }), 1);
  const after = await Table.findOne({ tableId: 'normal' }).lean();
  assert.deepEqual(after.createdAt, before.createdAt);
  assert.deepEqual(after.updatedAt, before.updatedAt);
});


test('deletion already holds parent: concurrent join retries to 404 and does not increment counters', async t => {
  await fixture('delete-first');
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const original = User.deleteMany.bind(User);
  let held = false;
  t.mock.method(User, 'deleteMany', async (...args) => {
    if (!held) { held = true; entered(); await hold; }
    return original(...args);
  });
  const counter = t.mock.method(visits, 'updateVisitStats', async () => {});
  const deleting = tables.deleteTable('delete-first');
  await ready;
  let attempted;
  const writeStarted = new Promise(resolve => { attempted = resolve; });
  const update = Table.updateOne.bind(Table);
  t.mock.method(Table, 'updateOne', (...args) => { attempted(); return update(...args); });
  const writing = assert.rejects(users.joinTable({ tableId: 'delete-first', name: 'late', password: 'local-only' }), error => error.status === 404);
  await writeStarted; release();
  await Promise.all([deleting, writing]);
  await assertGone('delete-first');
  assert.equal(counter.mock.callCount(), 0);
});
