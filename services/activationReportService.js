const moment = require("moment-timezone");
const Table = require("../models/Table");
const TableActivation = require("../models/TableActivation");
const activationService = require("./activationService");
const { TIMEZONE } = require("../utils/constants");

const countIf = (expression) => ({ $sum: { $cond: [expression, 1, 0] } });
const groups = [{ $group: {
  _id: null,
  total: { $sum: 1 },
  achieved: countIf("$achieved"),
  incomplete: countIf("$incomplete"),
  notAchieved: countIf({ $and: [{ $not: ["$achieved"] }, { $not: ["$incomplete"] }] }),
} }];

const facets = (startAt, asOf) => [
  { $project: {
    createdAt: 1, deadlineAt: 1, excludedReason: { $ifNull: ["$excludedReason", null] },
    incomplete: { $ifNull: ["$incomplete", false] }, scheduleChanged: 1, fallback: 1,
    achieved: { $gte: [{ $size: { $ifNull: ["$participants", []] } }, 3] },
  } },
  { $facet: {
    ended: [{ $match: { excludedReason: null, deadlineAt: { $ne: null, $lte: asOf, ...(startAt ? { $gte: startAt } : {}) } } }, ...groups],
    ongoing: [{ $match: { excludedReason: null, deadlineAt: { $gt: asOf } } }, ...groups],
    quality: [{ $group: {
      _id: null,
      missingLedgers: countIf("$fallback"),
      firstCollectedAt: { $min: "$createdAt" },
      excludedAdminTables: countIf({ $eq: ["$excludedReason", "admin"] }),
      invalidTables: countIf({ $eq: ["$excludedReason", "invalid_period"] }),
      scheduleChangedTables: countIf("$scheduleChanged"),
    } }],
  } },
];

const mergeCounts = (a = {}, b = {}) => ({
  total: (a.total || 0) + (b.total || 0),
  achieved: (a.achieved || 0) + (b.achieved || 0),
  incomplete: (a.incomplete || 0) + (b.incomplete || 0),
  notAchieved: (a.notAchieved || 0) + (b.notAchieved || 0),
});

const getReport = async (days = 0, asOf = new Date()) => {
  const periodDays = Number.isInteger(days) && days > 0 ? Math.min(days, 3660) : 0;
  const startAt = periodDays ? moment(asOf).tz(TIMEZONE).startOf("day").subtract(periodDays - 1, "days").toDate() : null;
  const [rows, legacyTables] = await Promise.all([
    TableActivation.aggregate([
      { $project: { createdAt: 1, deadlineAt: 1, excludedReason: 1, participants: 1, incomplete: 1, scheduleChanged: 1 } },
      { $set: { fallback: false } },
      { $unionWith: { coll: Table.collection.name, pipeline: [
        { $match: { "activationSnapshot.version": 1 } },
        { $project: {
          _id: "$tableId", createdAt: "$activationSnapshot.createdAt", deadlineAt: "$activationSnapshot.deadlineAt",
          excludedReason: "$activationSnapshot.excludedReason", incomplete: { $literal: true }, fallback: { $literal: true },
        } },
      ] } },
      // Deduplicate live snapshots and ledgers in the same aggregation; a concurrent
      // creation can at worst be reported as incomplete, never twice in the denominator.
      { $sort: { _id: 1, fallback: 1 } },
      { $group: { _id: "$_id", row: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$row" } },
      ...facets(startAt, asOf),
    ]).option({ maxTimeMS: 1500 }),
    Table.countDocuments({ activationSnapshot: { $exists: false } }).maxTimeMS(1500),
  ]);
  const summary = rows[0] || {};
  const ended = mergeCounts(summary.ended?.[0]);
  const ongoing = mergeCounts(summary.ongoing?.[0]);
  const quality = summary.quality?.[0] || {};
  const collectionFailureSince = activationService.getCollectionFailureSince();
  const partial = !!collectionFailureSince || ended.incomplete > 0 || ongoing.incomplete > 0 || (quality.missingLedgers || 0) > 0;
  return {
    version: 1,
    status: partial ? "partial" : "ok",
    collectionMode: "best_effort",
    asOf,
    period: { days: periodDays, startAt, endAt: asOf, timezone: TIMEZONE, basis: "deadline" },
    firstCollectedAt: quality.firstCollectedAt || null,
    ended: { ...ended, ratePercent: !partial && ended.total > 0 ? Math.round(ended.achieved / ended.total * 1000) / 10 : null },
    ongoing,
    quality: {
      scope: "all_tracked",
      legacyTables,
      excludedAdminTables: quality.excludedAdminTables || 0,
      invalidTables: quality.invalidTables || 0,
      scheduleChangedTables: quality.scheduleChangedTables || 0,
      missingLedgers: quality.missingLedgers || 0,
      collectionFailureSince,
    },
  };
};

module.exports = { getReport };
