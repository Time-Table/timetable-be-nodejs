const mongoose = require("mongoose");

const rankSchema = new mongoose.Schema({
  tableId: {
    type: String,
    ref: "Table",
    required: true,
  },
  rankList: [
    {
      sum: {
        type: Number,
        required: true,
      },
      date: {
        type: String,
        required: true,
      },
      members: {
        type: [String],
        required: true,
      },
    },
  ],
});

const Rank = mongoose.model("Rank", rankSchema);
module.exports = Rank;
