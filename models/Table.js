const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 50,
  },
  meetingUrl: {
    type: String,
    required: true,
  },
  dates: [
    {
      type: Date,
      required: true,
    },
  ],
  timeRange: {
    startHour: {
      type: String,
      required: true,
    },
    endHour: {
      type: String,
      required: true,
    },
  },
  banedCells: [
    {
      type: String,
      required: false,
    },
  ],
});

const Table = mongoose.model("Table", tableSchema);
module.exports = Table;
