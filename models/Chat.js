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
        maxlength: 500,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // expiresAfter: {
  //   type: Date,
  //   required: false,
  // },
});

const Chat = mongoose.model("Chat", chatSchema);
module.exports = Chat;
