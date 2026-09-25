const mongoose = require("mongoose");
const Table = require("../models/Table");

// Child writes and deletion contend on the same parent document. A read-only
// existence check cannot stop an in-flight request recreating deleted children.
const withTableMutation = (tableId, write) => mongoose.connection.transaction(async (session) => {
  const parent = await Table.updateOne({ tableId }, { $inc: { __v: 1 } }, { session, timestamps: false });
  if (!parent.matchedCount) throw { status: 404, message: "테이블을 찾을 수 없습니다." };
  return write(session);
});

module.exports = { withTableMutation };
