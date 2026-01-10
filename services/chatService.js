const Chat = require("../models/Chat");
const Table = require("../models/Table");

const postChat = async (data) => {
  const { tableId, name, message } = data;

  const tableData = await Table.findOne({ tableId });
  if (!tableData) {
    throw { status: 404, message: "테이블을 찾을 수 없습니다." };
  }

  const newMessage = {
    name,
    message,
    timestamp: new Date(),
  };

  await Chat.findOneAndUpdate(
    { tableId },
    { $push: { chats: newMessage } },
    { upsert: true, new: true }
  );

  return true;
};

const getChats = async (tableId) => {
  const chatData = await Chat.findOne({ tableId });
  return chatData ? chatData.chats : null;
};

module.exports = {
  postChat,
  getChats,
};
