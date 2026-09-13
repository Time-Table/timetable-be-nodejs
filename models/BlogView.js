const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");

/**
 * 블로그 글 조회 기록. 한 문서가 히트 하나다.
 *
 * Event 컬렉션에 넣지 않는 이유: Event는 180일 TTL이 걸려 있어 "이 글이 지금까지 몇 번
 * 읽혔나"라는 누적치가 사라진다. 조회수는 글 교체 판단의 근거라 영구 보관한다.
 * visitorId는 고유 방문자 집계와 서비스 전환(Event와 교집합) 계산에만 쓴다.
 */
const blogViewSchema = new mongoose.Schema({
  slug: { type: String, required: true },
  visitorId: { type: String, required: true },
  // 첫 진입 출처(first-touch). analytics.js의 getSource()와 같은 값이다.
  source: { type: String, required: false },
  device: { type: String, required: false },
  // KST 기준 날짜. Event·Visiter와 같은 방식으로 기간 필터에 쓴다.
  date: {
    type: String,
    required: true,
    default: () => moment().tz(TIMEZONE).format("YYYY-MM-DD"),
  },
  createdAt: { type: Date, default: Date.now },
});

// 기간별 글별 집계와 방문자 교집합에 맞춘 인덱스
blogViewSchema.index({ date: 1, slug: 1 });
blogViewSchema.index({ visitorId: 1 });

const BlogView = mongoose.model("BlogView", blogViewSchema);
module.exports = BlogView;
