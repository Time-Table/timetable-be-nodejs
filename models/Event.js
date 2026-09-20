const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");

const EVENT_TTL_DAYS = 180;

const eventSchema = new mongoose.Schema({
  // 퍼널 단계 이름 (utils/funnels.js의 EVENTS)
  name: {
    type: String,
    required: true,
  },
  // 브라우저 단위 익명 식별자. 한 사람이 어느 단계까지 갔는지 이어붙이는 용도로만 쓴다.
  visitorId: {
    type: String,
    required: true,
  },
  tableId: {
    type: String,
    required: false,
  },
  // 유입 경로. 어느 채널이 실제로 사용자를 데려오는지 보기 위해 첫 진입에만 기록한다.
  source: {
    type: String,
    required: false,
  },
  // 화면 폭 기준 기기 구분 (mobile / tablet / desktop)
  device: {
    type: String,
    required: false,
  },
  // 기존 이벤트의 미설정 값도 집계할 때는 unknown으로 취급한다.
  tableRole: {
    type: String,
    enum: ["creator", "participant", "unknown"],
    required: false,
  },
  // KST 기준 날짜. Visiter 모델과 같은 방식으로 일자별 조회에 쓴다.
  date: {
    type: String,
    required: true,
    default: () => moment().tz(TIMEZONE).format("YYYY-MM-DD"),
  },
  // 무한정 쌓이지 않도록 TTL 인덱스를 건다.
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * EVENT_TTL_DAYS,
  },
});

// 기간별 퍼널 집계(date로 필터 → visitorId로 그룹)에 맞춘 인덱스
eventSchema.index({ date: 1, visitorId: 1 });

const Event = mongoose.model("Event", eventSchema);
module.exports = Event;
