const mongoose = require("mongoose");
const { VALIDATION_RULES } = require("../utils/constants");

// 2026-09-28 사용자 결정: 받은 날부터 10년 뒤 자동 삭제. 개인정보처리방침과 짝이다.
const INQUIRY_TTL_DAYS = 365 * 10;

/**
 * 문의하기 양식으로 받은 문의. 답장은 운영자가 email로 직접 보낸다. email은 선택이라 없을 수 있다.
 *
 * context는 사용자가 적지 않고 브라우저가 함께 보낸 정보다. 화면에는 보여 주지 않고 개인정보처리방침에 적는다.
 * 모두 선택 값이며 형식이 틀리면 문의를 막지 않고 그 값만 버린다(inquiryService.buildContext).
 */
const inquirySchema = new mongoose.Schema({
  category: { type: String, enum: VALIDATION_RULES.INQUIRY.CATEGORIES, required: true },
  email: { type: String, required: false },
  summary: { type: String, required: true },
  detail: { type: String, required: true },
  hope: { type: String, required: false },
  context: {
    // localStorage의 참여 이름. 마지막으로 들어간 표 하나의 것만 남아 있어 tableId와 짝으로 둔다.
    name: { type: String, required: false },
    tableId: { type: String, required: false },
    // 문의를 누른 페이지의 경로(pathname). 도메인은 붙이지 않는다.
    fromPath: { type: String, required: false },
    userAgent: { type: String, required: false },
    viewport: { type: String, required: false },
    timeZone: { type: String, required: false },
    visitorId: { type: String, required: false },
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * INQUIRY_TTL_DAYS,
  },
});

const Inquiry = mongoose.model("Inquiry", inquirySchema);
module.exports = Inquiry;
