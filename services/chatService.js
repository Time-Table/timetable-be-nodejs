const Chat = require("../models/Chat");
const { withTableMutation } = require("./tableMutation");

const postChat = async (data) => {
  const { tableId, name, message } = data;

  return withTableMutation(tableId, async (session) => {
    const newMessage = { name, message, timestamp: new Date() };
    await Chat.findOneAndUpdate(
      { tableId }, { $push: { chats: newMessage } }, { upsert: true, new: true, session }
    );
    return true;
  });
};

const getChats = async (tableId) => {
  const chatData = await Chat.findOne({ tableId });
  return chatData ? chatData.chats : null;
};

module.exports = {
  postChat,
  getChats,
};
