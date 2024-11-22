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
    maxlength: 15,
  },
  password: {
    type: String,
    required: true,
    maxlength: 15,
  },
});

userSchema.index({ tableId: 1, name: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);
module.exports = User;
