const moment = require("moment-timezone");
const Table = require("../models/Table");
const User = require("../models/User");
const { TIMEZONE } = require("../utils/constants");

// All tables use current surviving registrations and the currently saved deadline.
// Historical ledgers remain untouched and do not participate in this report.
const deadlineFor = (table) => {
  if (!(table.createdAt instanceof Date) || !Number.isFinite(+table.createdAt) ||
      !Array.isArray(table.dates) || !table.dates.length ||
      !table.dates.every((day) => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        moment.tz(day, "YYYY-MM-DD", true, TIMEZONE).isValid()) ||
      typeof table.endHour !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(table.endHour)) return null;
  const [hours, minutes] = table.endHour.split(":").map(Number);
  const deadline = moment.tz([...table.dates].sort().at(-1), "YYYY-MM-DD", TIMEZONE)
    .add(hours * 60 + minutes, "minutes").toDate();
  return deadline >= table.createdAt ? deadline : null;
};

const getReport = async (days = 0, asOf = new Date()) => {
  const periodDays = Number.isInteger(days) && days > 0 ? Math.min(days, 3660) : 0;
  const startAt = periodDays ? moment(asOf).tz(TIMEZONE).startOf("day").subtract(periodDays - 1, "days").toDate() : null;
  const tables = await Table.find().select("tableId dates endHour createdAt +activationSnapshot -_id").maxTimeMS(750).lean();
  const quality = { existingTables: tables.length, trackedTables: 0, excludedAdminTables: 0,
    invalidTables: 0, missingLedgers: 0, collectionFailureSince: null };
  const rowsToCount = tables.map((table) => ({
    tableId: table.tableId, createdAt: table.createdAt, deadlineAt: deadlineFor(table),
    excludedReason: table.activationSnapshot?.excludedReason === "admin" ? "admin" : null,
  }));
  const eligible = [];
  for (const row of rowsToCount) {
    if (row.excludedReason === "admin") { quality.excludedAdminTables++; continue; }
    if (row.excludedReason || !(row.createdAt instanceof Date) || !Number.isFinite(+row.createdAt) ||
        !(row.deadlineAt instanceof Date) || !Number.isFinite(+row.deadlineAt) ||
        row.deadlineAt < row.createdAt || row.createdAt > asOf) { quality.invalidTables++; continue; }
    if (startAt && row.deadlineAt < startAt) continue;
    eligible.push(row);
  }
  const existing = eligible;

  // One batched read, no per-table queries. Return counts only, never participant names.
  const rows = existing.length ? await User.aggregate([
    { $match: {
      name: { $type: "string", $ne: "" },
      $or: existing.map((table) => ({
        tableId: table.tableId,
        createdAt: { $type: "date", $gte: table.createdAt, $lte: new Date(Math.min(+table.deadlineAt, +asOf)) },
      })),
    } },
    { $group: { _id: { tableId: "$tableId", name: "$name" } } },
    { $group: { _id: "$_id.tableId", count: { $sum: 1 } } },
  ]).option({ maxTimeMS: 750 }) : [];
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  const ended = { total: 0, achieved: 0, notAchieved: 0, incomplete: 0 };
  const ongoing = { total: 0, achieved: 0, notAchieved: 0, incomplete: 0 };
  for (const table of eligible) {
    const bucket = table.deadlineAt <= asOf ? ended : ongoing;
    bucket.total++;
    if ((counts.get(table.tableId) || 0) >= 3) bucket.achieved++;
    else bucket.notAchieved++;
  }
  return {
    version: 1, status: "ok", definition: "current_registration_before_deadline", asOf,
    period: { days: periodDays, startAt, endAt: asOf, timezone: TIMEZONE, basis: "deadline" },
    ended: { ...ended, ratePercent: ended.total ? Math.round(ended.achieved / ended.total * 1000) / 10 : null },
    ongoing, quality,
  };
};

module.exports = { getReport };
