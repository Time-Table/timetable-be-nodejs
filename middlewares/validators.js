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

const validateBlogView = (req, res, next) => {
  const { slug, visitorId } = req.body;

  if (typeof slug !== "string" || !VALIDATION_RULES.BLOG_SLUG.test(slug)) {
    return res.status(400).json({ success: false, message: "slug 형식이 올바르지 않습니다." });
  }

  if (
    typeof visitorId !== "string" ||
    visitorId.length === 0 ||
    visitorId.length > VALIDATION_RULES.VISITOR_ID.MAX_LENGTH
  ) {
    return res.status(400).json({ success: false, message: "visitorId가 올바르지 않습니다." });
  }

  next();
};

const validateInquiry = (req, res, next) => {
  const { category, email, summary, detail, hope } = req.body;
  const rules = VALIDATION_RULES.INQUIRY;
  const bad = (message) => res.status(400).json({ success: false, message });

  if (!rules.CATEGORIES.includes(category)) {
    return bad("문의 유형을 선택해 주세요.");
  }

  // 답장 받을 이메일은 선택이다(2026-09-28 사용자 지시). 적었다면 형식을 본다.
  const emailGiven = typeof email === "string" ? email.trim() !== "" : email !== undefined && email !== null;
  if (
    emailGiven &&
    (typeof email !== "string" ||
      email.trim().length > rules.EMAIL_MAX_LENGTH ||
      !rules.EMAIL.test(email.trim()))
  ) {
    return bad("답장 받을 이메일 형식이 올바르지 않습니다.");
  }

  if (
    typeof summary !== "string" ||
    summary.trim().length === 0 ||
    summary.trim().length > rules.SUMMARY_MAX_LENGTH
  ) {
    return bad(`어떤 문의인지 1자 이상 ${rules.SUMMARY_MAX_LENGTH}자 이하로 적어 주세요.`);
  }

  if (
    typeof detail !== "string" ||
    detail.trim().length < rules.DETAIL_MIN_LENGTH ||
    detail.trim().length > rules.DETAIL_MAX_LENGTH
  ) {
    return bad(
      `자세한 내용은 ${rules.DETAIL_MIN_LENGTH}자 이상 ${rules.DETAIL_MAX_LENGTH.toLocaleString()}자 이하로 적어 주세요.`,
    );
  }

  // 바라는 점은 선택이다. 보냈다면 문자열이고 길이 안이어야 한다.
  if (hope !== undefined && hope !== null && (typeof hope !== "string" || hope.trim().length > rules.HOPE_MAX_LENGTH)) {
    return bad(`바라는 점은 ${rules.HOPE_MAX_LENGTH.toLocaleString()}자 이하로 적어 주세요.`);
  }

  next();
};

module.exports = {
  validateTableCreate,
  validateUserJoin,
  validateChatPost,
  validateScheduleAdd,
  validateBlogView,
  validateInquiry,
};
