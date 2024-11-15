const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  tableId: {
    type: String,
    ref: "Table",
    required: true,
  },
  name: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: false,
  },
});

const User = mongoose.model("User", userSchema);
module.exports = User;
