const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    tableId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    availableTimes: [
      {
        type: String,
        required: false,
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
