/**
 * 표 화면 A/B 2회차 설정(2026-10-01). FE `src/utils/tableExperiment.js`와 같은 계산을 해야 한다.
 * 설계: 하네스 specs/table-ab-2.md. 사람(브라우저 visitorId) 단위로 반반 나누고, 누구나 띠로 바꿀 수 있다.
 * 켜고 끄기는 Experiment 문서(key)의 startedAt·stoppedAt(매니저 버튼)이다. key·비율·해시를 바꾸면 쌓인 기록의 배정도 바뀐다.
 */
const { fnv1a32 } = require("./landingExperiment");

const TABLE_AB = {
  key: "table-ab-2",
  bPercent: 50,
  // 판정 대상 표의 마감이 시작 뒤 이 날 수 안이어야 한다(이벤트 보관 180일 안에 판정).
  maxDeadlineDays: 150,
};

/** visitorId → "A" | "B". `table-ab-2:` + visitorId의 해시를 100으로 나눈 칸이 50 미만이면 B. */
const tableUiFor = (visitorId) =>
  fnv1a32(`${TABLE_AB.key}:${visitorId}`) % 100 < TABLE_AB.bPercent ? "B" : "A";

module.exports = { TABLE_AB, tableUiFor };
