const mongoose = require("mongoose");

// Independent of User / Event TTL / table deletion. No names or schedule cells.
const schema = new mongoose.Schema({
  _id: String, // tableId; MongoDB's built-in unique index makes creation idempotent.
  version: Number,
  createdAt: Date,
  deadlineAt: Date,
  excludedReason: { type: String, default: null },
  keySalt: { type: String, select: false },
  scheduleFingerprint: String,
  scheduleChanged: { type: Boolean, default: false },
  incomplete: { type: Boolean, default: false },
  participants: [{ _id: false, key: String, firstSavedAt: Date }],
}, { bufferCommands: false });

module.exports = mongoose.model("TableActivation", schema);
