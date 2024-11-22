const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema(
  {
    tableId: {
      type: String,
      required: true,
    },
    timeInfo: [
      {
        time: {
          type: String,
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
  { timestamps: true }
);

const Schedule = mongoose.model("Schedule", scheduleSchema);
module.exports = Schedule;
