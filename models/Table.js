const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      maxlength: 50,
    },
    tableId: {
      type: String,
      required: true,
      unique: true,
    },
    // 통계 전용. 생성 브라우저와 이후 표 이용을 연결하며 인증에 사용하지 않는다.
    creatorVisitorId: {
      type: String,
      maxlength: 64,
      immutable: true,
      select: false,
    },
    // Server-owned creation snapshot. Never expose or accept it over the public API.
    activationSnapshot: {
      type: new mongoose.Schema({
        version: Number, createdAt: Date, deadlineAt: Date, excludedReason: String,
        keySalt: String, scheduleFingerprint: String,
      }, { _id: false }),
      immutable: true,
      select: false,
    },
    dates: [
      {
        type: String,
        required: true,
      },
    ],
    startHour: {
      type: String,
      required: true,
    },
    endHour: {
      type: String,
      required: true,
    },
    banedCells: [
      {
        type: String,
        required: false,
      },
    ],
    // expiresAfter: {
    //   type: Date,
    //   required: false,
    // },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, value) => {
        delete value.creatorVisitorId;
        delete value.activationSnapshot;
        return value;
      },
    },
  }
);

const Table = mongoose.model("Table", tableSchema);
module.exports = Table;
