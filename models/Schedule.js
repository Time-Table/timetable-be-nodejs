const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema({
  tableId: {
    type: String,
    ref: "Table",
    required: true,
  },
  membersSchedule: {
    count: {
      type: Number,
      required: true,
    },
    users: [
      {
        name: {
          type: String,
          required: true,
        },
        availableTimes: {
          type: [String], // 가능한 시간대
          required: true,
        },
      },
    ],
    timeInfo: [
      {
        time: {
          type: String, // 시간 정보 예: "2024-11-07-13:00"
          required: true,
        },
        colorNumber: {
          type: Number,
          required: true,
        },
        rank: {
          type: Number,
          required: true,
        },
      },
    ],
  },
});

const Schedule = mongoose.model("Schedule", scheduleSchema);
module.exports = Schedule;
