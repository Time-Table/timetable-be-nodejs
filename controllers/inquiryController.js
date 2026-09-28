const inquiryService = require("../services/inquiryService");
const Sentry = require("@sentry/node");
const { VALIDATION_RULES } = require("../utils/constants");

const createInquiry = async (req, res) => {
  // 관리자 브라우저에서 보낸 문의는 저장하지 않는다. 운영 점검이 문의함에 10년짜리 기록을 남기지 않게 한다.
  if (req.isAdmin) {
    return res.status(200).json({ success: true, skipped: true });
  }

  // 사람에게는 보이지 않는 칸. 채워졌다면 봇이므로 저장하지 않되, 눈치채지 못하게 성공처럼 답한다.
  if (req.body.website) {
    return res.status(201).json({ success: true });
  }

  const { category, email, summary, detail, hope, context } = req.body;

  try {
    await inquiryService.createInquiry({
      category,
      email,
      summary,
      detail,
      hope,
      context,
      userAgent: req.get("User-Agent"),
    });
    return res.status(201).json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

const getInquiries = async (req, res) => {
  const limit = Math.min(Math.max(Math.floor(Number(req.query.limit)) || 100, 1), 300);

  try {
    const data = await inquiryService.listInquiries(limit);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

// ObjectId 문자열만 받는다. mongoose.isValidObjectId는 아무 12자 문자열도 통과시킨다.
const INQUIRY_ID = /^[a-f0-9]{24}$/i;

const updateInquiryStatus = async (req, res) => {
  const { inquiryId } = req.params;
  const { status } = req.body || {};

  if (!INQUIRY_ID.test(inquiryId)) {
    return res.status(400).json({ success: false, message: "문의 ID 형식이 올바르지 않습니다." });
  }
  if (!VALIDATION_RULES.INQUIRY.STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: "문의 상태가 올바르지 않습니다." });
  }

  try {
    const data = await inquiryService.updateInquiryStatus(inquiryId, status);
    if (!data) return res.status(404).json({ success: false, message: "문의를 찾을 수 없습니다." });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

const deleteInquiry = async (req, res) => {
  const { inquiryId } = req.params;

  if (!INQUIRY_ID.test(inquiryId)) {
    return res.status(400).json({ success: false, message: "문의 ID 형식이 올바르지 않습니다." });
  }

  try {
    const deleted = await inquiryService.deleteInquiry(inquiryId);
    if (!deleted) return res.status(404).json({ success: false, message: "문의를 찾을 수 없습니다." });
    return res.status(200).json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({ success: false, message: "서버 오류 발생" });
  }
};

module.exports = { createInquiry, getInquiries, updateInquiryStatus, deleteInquiry };
