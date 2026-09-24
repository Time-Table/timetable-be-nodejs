const Table = require("../models/Table");
const TableActivation = require("../models/TableActivation");
const { hasValidCell, participantKey, scheduleFingerprint } = require("../utils/activationDefinition");
const { runTelemetry } = require("../utils/telemetry");

// Conservative process-local alarm. Persisted incomplete flags survive restarts;
// total DB/process outages still require hosting-log review (see rollout runbook).
let collectionFailureSince = null;
const noteFailure = () => { collectionFailureSince ||= new Date(); };
const WRITE_MS = 150;

const ensureLedger = (table, incomplete = false) => TableActivation.updateOne(
  { _id: table.tableId },
  { $setOnInsert: { ...(table.activationSnapshot.toObject?.() || table.activationSnapshot), participants: [], incomplete } },
  { upsert: true, maxTimeMS: WRITE_MS },
);

const markIncomplete = async (tableId) => {
  noteFailure();
  await runTelemetry("activation_gap", () => TableActivation.updateOne(
    { _id: tableId }, { $set: { incomplete: true } }, { maxTimeMS: WRITE_MS },
  ), { retry: true });
};

const recordCreation = async (table) => {
  const result = await runTelemetry("activation_create", () => ensureLedger(table), { retry: true });
  if (!result.ok) noteFailure(); // A live table without a ledger is also detected by the report.
};

const recordSchedule = async ({ tableId, name, availableTimes, completedAt }) => {
  const result = await runTelemetry("activation_save", async () => {
    const table = await Table.findOne({ tableId }).select("+activationSnapshot").maxTimeMS(WRITE_MS).lean();
    if (!table) {
      // A deletion racing a save cannot be classified safely.
      await TableActivation.updateOne({ _id: tableId }, { $set: { incomplete: true } }, { maxTimeMS: WRITE_MS });
      return;
    }
    const snapshot = table.activationSnapshot;
    if (!snapshot || snapshot.excludedReason || completedAt < snapshot.createdAt ||
        completedAt > snapshot.deadlineAt || !hasValidCell(table, availableTimes)) return;

    // Recovery cannot reconstruct any earlier missed saves, so remains incomplete.
    await ensureLedger(table, true);
    const key = participantKey(snapshot, name);
    const changed = scheduleFingerprint(table) !== snapshot.scheduleFingerprint;
    if (changed) await TableActivation.updateOne({ _id: tableId }, { $set: { scheduleChanged: true } }, { maxTimeMS: WRITE_MS });
    // One atomic update combines same-name deduplication, earliest timestamp,
    // and retaining the earliest three. Separate $min/$push writes lose a race
    // when the later request inserts first (or its key is evicted between writes).
    await TableActivation.updateOne({ _id: tableId }, [{ $set: {
      participants: { $let: {
        vars: {
          others: { $filter: { input: "$participants", as: "p", cond: { $ne: ["$$p.key", key] } } },
          previous: { $filter: { input: "$participants", as: "p", cond: { $eq: ["$$p.key", key] } } },
        },
        in: { $let: {
          vars: { candidate: {
            key: { $literal: key },
            firstSavedAt: { $min: [completedAt, { $ifNull: [{ $arrayElemAt: ["$$previous.firstSavedAt", 0] }, completedAt] }] },
          } },
          in: { $slice: [{ $concatArrays: [
            { $filter: { input: "$$others", as: "p", cond: { $lte: ["$$p.firstSavedAt", "$$candidate.firstSavedAt"] } } },
            ["$$candidate"],
            { $filter: { input: "$$others", as: "p", cond: { $gt: ["$$p.firstSavedAt", "$$candidate.firstSavedAt"] } } },
          ] }, 3] },
        } },
      } },
    } }], { maxTimeMS: WRITE_MS });
  }, { retry: true });
  if (!result.ok) await markIncomplete(tableId);
};

const recordTableChange = async (table) => {
  if (!table?.activationSnapshot) return;
  const result = await runTelemetry("activation_table_change", async () => {
    await ensureLedger(table, true);
    if (scheduleFingerprint(table) !== table.activationSnapshot.scheduleFingerprint) {
      await TableActivation.updateOne({ _id: table.tableId }, { $set: { scheduleChanged: true } }, { maxTimeMS: WRITE_MS });
    }
  }, { retry: true });
  if (!result.ok) await markIncomplete(table.tableId);
};

module.exports = { recordCreation, recordSchedule, recordTableChange, getCollectionFailureSince: () => collectionFailureSince };
