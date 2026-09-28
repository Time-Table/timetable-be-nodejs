const mongoose = require("mongoose");

/**
 * A/B 실험 상태(2026-09-29 랜딩 A/B 1회차). 문서가 없으면 진행 중이다.
 * 사람이 매니저 페이지에서 "중단"을 누르면 stoppedAt을 한 번 적는다. 되돌리기는 없다(다시 하면 새 key로 2회차).
 */
const experimentSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  stoppedAt: {
    type: Date,
    required: false,
  },
});

const Experiment = mongoose.model("Experiment", experimentSchema);
module.exports = Experiment;
