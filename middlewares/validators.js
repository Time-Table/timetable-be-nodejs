const { VALIDATION_RULES } = require("../utils/constants");

const validateTableCreate = (req, res, next) => {
  const { title, dates, startHour, endHour } = req.body;

  if (
    !title ||
    title.length < VALIDATION_RULES.TITLE.MIN_LENGTH ||
    title.length > VALIDATION_RULES.TITLE.MAX_LENGTH
  ) {
    return res.status(400).json({
      success: false,
      message: `제목은 1자 이상 ${VALIDATION_RULES.TITLE.MAX_LENGTH}자 이하로 입력해주세요.`,
    });
  }

  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ success: false, message: "유효한 날짜 배열이 필요합니다." });
  }

  const isValidDates = dates.every((date) => VALIDATION_RULES.DATE_FORMAT.test(date));
  if (!isValidDates) {
    return res
      .status(400)
      .json({ success: false, message: "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)" });
  }

  if (
    !VALIDATION_RULES.TIME_FORMAT.test(startHour) ||
    !VALIDATION_RULES.TIME_FORMAT.test(endHour)
  ) {
    return res
      .status(400)
      .json({ success: false, message: "시간 형식이 올바르지 않습니다. (HH:mm)" });
  }

  const [startH, startM] = startHour.split(":").map(Number);
  const [endH, endM] = endHour.split(":").map(Number);

  if (endH === 24 && endM > 0) {
    return res.status(400).json({ success: false, message: "24시 이후의 시간은 설정할 수 없습니다." });
  }

  if (startH > endH || (startH === endH && startM >= endM)) {
    return res
      .status(400)
      .json({ success: false, message: "종료 시간은 시작 시간보다 늦어야 합니다." });
  }

  next();
};

const validateUserJoin = (req, res, next) => {
  const { name, password, tableId } = req.body;

  if (!tableId) {
    return res.status(400).json({ success: false, message: "TableId가 필요합니다." });
  }

  if (
    !name ||
    !VALIDATION_RULES.NAME.REGEX.test(name) ||
    name.length > VALIDATION_RULES.NAME.MAX_LENGTH
  ) {
    return res.status(400).json({
      success: false,
      message: `이름은 한글, 영문, 숫자만 가능하며 ${VALIDATION_RULES.NAME.MAX_LENGTH}자 이하여야 합니다.`,
    });
  }

  if (!password || password.length < VALIDATION_RULES.PASSWORD.MIN_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `비밀번호는 최소 ${VALIDATION_RULES.PASSWORD.MIN_LENGTH}자 이상이어야 합니다.`,
    });
  }

  next();
};

const validateChatPost = (req, res, next) => {
  const { tableId, name, message } = req.body;

  if (!tableId || !name) {
    return res.status(400).json({ success: false, message: "필수 정보가 누락되었습니다." });
  }

  if (
    !message ||
    message.trim().length === 0 ||
    message.length > VALIDATION_RULES.MESSAGE.MAX_LENGTH
  ) {
    return res.status(400).json({
      success: false,
      message: `메시지는 1자 이상 ${VALIDATION_RULES.MESSAGE.MAX_LENGTH}자 이하여야 합니다.`,
    });
  }

  next();
};

const validateScheduleAdd = (req, res, next) => {
  const { tableId, name, availableTimes } = req.body;

  if (!tableId || !name) {
    return res.status(400).json({ success: false, message: "필수 정보가 누락되었습니다." });
  }

  if (!Array.isArray(availableTimes)) {
    return res.status(400).json({ success: false, message: "가능 시간은 배열 형태여야 합니다." });
  }

  next();
};

module.exports = {
  validateTableCreate,
  validateUserJoin,
  validateChatPost,
  validateScheduleAdd,
};
