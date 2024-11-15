const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  tableId: {
    type: String,
    ref: "Table",
    required: true,
  },
  chats: [
    {
      name: {
        type: String,
        required: true,
      },
      message: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

const Chat = mongoose.model("Chat", chatSchema);
module.exports = Chat;
