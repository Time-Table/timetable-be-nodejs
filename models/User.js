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
      maxlength: 15,
    },
    password: {
      type: String,
      required: true,
      maxlength: 15,
    },
    availableTimes: [
      {
        type: String,
        required: false,
      },
    ],
    expiresAfter: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
