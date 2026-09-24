const { createHash, createHmac, randomBytes } = require("node:crypto");
const moment = require("moment-timezone");
const { TIMEZONE } = require("./constants");

const minuteOfDay = (value) => {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const validDate = (value) => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) && moment.tz(value, "YYYY-MM-DD", true, TIMEZONE).isValid();
const scheduleFingerprint = (table) => createHash("sha256").update(JSON.stringify({
  dates: [...new Set(table.dates || [])].sort(), startHour: table.startHour, endHour: table.endHour,
  banedCells: [...new Set(table.banedCells || [])].sort(),
})).digest("hex");

const createSnapshot = (table, createdAt, isAdmin = false) => {
  const start = minuteOfDay(table.startHour);
  const end = minuteOfDay(table.endHour);
  const valid = Array.isArray(table.dates) && table.dates.length > 0 && table.dates.every(validDate) &&
    start !== null && end !== null && start < end;
  const deadlineAt = valid
    ? moment.tz([...table.dates].sort().at(-1), "YYYY-MM-DD", TIMEZONE).add(end, "minutes").toDate()
    : null;
  return {
    version: 1,
    createdAt,
    deadlineAt,
    excludedReason: isAdmin ? "admin" : (!deadlineAt || deadlineAt < createdAt ? "invalid_period" : null),
    keySalt: randomBytes(32).toString("hex"),
    scheduleFingerprint: scheduleFingerprint(table),
  };
};

const hasValidCell = (table, cells) => {
  const start = minuteOfDay(table.startHour);
  const end = minuteOfDay(table.endHour);
  if (start === null || end === null || !Array.isArray(cells)) return false;
  return cells.some((cell) => {
    if (typeof cell !== "string" || !/^\d{4}-\d{2}-\d{2}-\d{2}:(00|30)$/.test(cell)) return false;
    const date = cell.slice(0, 10);
    const minute = minuteOfDay(cell.slice(11));
    return validDate(date) && table.dates.includes(date) && minute !== null &&
      minute >= start && minute + 30 <= end && !(table.banedCells || []).includes(cell);
  });
};

const participantKey = (snapshot, name) => createHmac("sha256", snapshot.keySalt).update(name).digest("hex");
module.exports = { createSnapshot, scheduleFingerprint, hasValidCell, participantKey };
