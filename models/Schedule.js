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
        count: {
          type: Number,
          required: true,
        },
        members: [
          {
            type: String,
            required: true,
          },
        ],
      },
    ],
    // expiresAfter: {
    //   type: Date,
    //   required: false,
    // },
  },
  { timestamps: true }
);

const Schedule = mongoose.model("Schedule", scheduleSchema);
module.exports = Schedule;
