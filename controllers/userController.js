const userService = require("../services/userService");
const Sentry = require("@sentry/node");

const join = async (req, res) => {
  const { tableId, name, password, availableTimes } = req.body;

  try {
    const result = await userService.joinTable(
      { tableId, name, password, availableTimes },
      { skipStats: req.isAdmin },
    );

    return res.status(200).json({
      success: true,
      code: result.isNewUser ? 201 : 200,
      message: result.isNewUser ? "유저 등록 성공" : "해당 유저로 로그인됩니다.",
      data: result.user,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: "이미 사용 중인 이름입니다. 다른 이름을 선택하세요.",
      });
    }

    if (err.status) {
      return res.status(err.status).json({
        success: false,
        code: err.status,
        message: err.message,
      });
    }

    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      code: 500,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
};

const userInfo = async (req, res) => {
  const { tableId, name, password } = req.body;
  if (!tableId || !name || !password) {
    return res.status(400).json({
      success: false,
      message: `이름과 비밀번호를 모두 입력해주세요.`,
    });
  }

  try {
    const data = await userService.getUserInfo(tableId, name, password);
    res.status(200).json({
      success: true,
      code: 200,
      data: data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json(err);
    }
    Sentry.captureException(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
};

const deleteUser = async (req, res) => {
  const { tableId, name, password } = req.body;

  if (!tableId || !name) {
    return res.status(400).json({
      success: false,
      message: `이름과 비밀번호를 모두 입력해주세요.`,
    });
  }

  try {
    await userService.deleteUser({ tableId, name, password });
    res.status(200).json({
      success: true,
      message: "유저가 성공적으로 삭제되었습니다.",
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json(err);
    }
    Sentry.captureException(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
};

const getUsers = async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({
      success: false,
      message: "tableId가 제공되지 않았습니다.",
    });
  }

  try {
    const users = await userService.getAllUsers(tableId);

    if (!users || users.length === 0) {
      return res.status(201).json({
        success: true,
        message: "해당 테이블에 유저가 존재하지 않습니다.",
        code: 201,
      });
    }

    return res.status(200).json({
      success: true,
      data: users,
      code: 200,
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
};

module.exports = {
  join,
  userInfo,
  deleteUser,
  getUsers,
};
