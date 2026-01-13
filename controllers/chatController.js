const chatService = require("../services/chatService");
const Sentry = require("@sentry/node");

const postChat = async (req, res) => {
  const { tableId, name, message } = req.body;

  try {
    await chatService.postChat({ tableId, name, message });

    return res.status(200).json({
      success: true,
      message: "채팅 메시지가 저장되었습니다.",
    });
  } catch (err) {
    if (err.status) {
        return res.status(err.status).json(err);
    }
    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
};

const getChats = async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({
      success: false,
      message: "tableId를 입력하세요.",
    });
  }

  try {
    const chats = await chatService.getChats(tableId);

    if (!chats) {
      return res.status(201).json({
        success: true,
        message: "채팅 기록이 없습니다.",
        queriedId: tableId,
        status: 201,
      });
    }

    return res.status(200).json({
      success: true,
      data: chats,
      status: 200,
    });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
};

module.exports = {
  postChat,
  getChats,
};
