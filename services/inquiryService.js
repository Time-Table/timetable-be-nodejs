const Inquiry = require("../models/Inquiry");
const { VALIDATION_RULES } = require("../utils/constants");

const TABLE_ID = /^[A-Za-z0-9-]{1,64}$/;
const VISITOR_ID = /^[A-Za-z0-9-]{1,64}$/;
// "/"로 시작하는 사이트 안 경로만 받는다. "//"나 역슬래시는 브라우저가 다른 도메인으로 해석하므로 막는다.
const FROM_PATH = /^\/(?![/\\])[^\s\\]{0,299}$/;
const VIEWPORT = /^\d{1,5}x\d{1,5}$/;
const TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;
const USER_AGENT_MAX_LENGTH = 300;

const matches = (value, pattern) =>
  typeof value === "string" && pattern.test(value) ? value : undefined;

const isValidName = (value) =>
  typeof value === "string" &&
  value.length <= VALIDATION_RULES.NAME.MAX_LENGTH &&
  VALIDATION_RULES.NAME.REGEX.test(value);

/**
 * 브라우저가 함께 보낸 정보를 정리한다. 순수 함수라 DB 없이 테스트한다.
 * 자동으로 모은 값 때문에 사람이 쓴 문의가 막히면 안 되므로, 틀린 값은 400 대신 버린다.
 */
const buildContext = (context, userAgent) => {
  const raw = context && typeof context === "object" ? context : {};
  return {
    name: isValidName(raw.name) ? raw.name : undefined,
    tableId: matches(raw.tableId, TABLE_ID),
    fromPath: matches(raw.fromPath, FROM_PATH),
    userAgent:
      typeof userAgent === "string" && userAgent
        ? userAgent.slice(0, USER_AGENT_MAX_LENGTH)
        : undefined,
    viewport: matches(raw.viewport, VIEWPORT),
    timeZone: matches(raw.timeZone, TIME_ZONE),
    visitorId: matches(raw.visitorId, VISITOR_ID),
  };
};

const createInquiry = async ({ category, email, summary, detail, hope, context, userAgent }) => {
  const trimmedHope = typeof hope === "string" ? hope.trim() : "";
  return await Inquiry.create({
    category,
    email: typeof email === "string" && email.trim() ? email.trim() : undefined,
    summary: summary.trim(),
    detail: detail.trim(),
    hope: trimmedHope || undefined,
    context: buildContext(context, userAgent),
  });
};

/** 관리자 문의함. 최신순으로 limit건과 전체 건수를 돌려준다. */
const listInquiries = async (limit) => {
  const [total, rows] = await Promise.all([
    Inquiry.countDocuments(),
    Inquiry.find().sort({ createdAt: -1 }).limit(limit).lean(),
  ]);

  return {
    total,
    inquiries: rows.map(({ _id, __v, ...row }) => ({ id: String(_id), status: "new", ...row })),
  };
};

/** 처리 상태를 바꾼다. 없는 문의면 null. */
const updateInquiryStatus = async (id, status) => {
  const row = await Inquiry.findByIdAndUpdate(id, { status }, { new: true, runValidators: true }).lean();
  return row ? { id: String(row._id), status: row.status } : null;
};

/** 문의를 지운다. 되돌릴 수 없다. 없는 문의면 false. */
const deleteInquiry = async (id) => Boolean(await Inquiry.findByIdAndDelete(id));

module.exports = { buildContext, createInquiry, listInquiries, updateInquiryStatus, deleteInquiry };
