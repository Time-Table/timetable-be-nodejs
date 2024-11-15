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
    },
    dates: [
      {
        type: Date,
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
  },
  { timestamps: true } // 영국 시간 기준
);

const Table = mongoose.model("Table", tableSchema);
module.exports = Table;
