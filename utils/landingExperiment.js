/**
 * 랜딩 A/B 1회차 설정(2026-09-29). FE `src/utils/landingExperiment.js`와 같은 계산을 해야 한다.
 * 명세: 하네스 specs/api-contract.md "랜딩 A/B 1회차 (2026-09-29)", specs/landing-ab-manager.md.
 *
 * FE는 배정을 저장하지 않고 방문자 ID에서 계산하므로, 서버도 이벤트의 visitorId로 같은 배정을 되살린다.
 * key·비율·해시를 바꾸면 이미 쌓인 기록의 배정도 바뀐다. 실험 중에는 바꾸지 않는다.
 */
const LANDING_AB = {
  key: "landing-ab-1",
  // 사람이 정한 시작일(표시용). 집계는 startAt부터다.
  plannedStartDate: "2026-09-29",
  // 이번 계측 FE가 운영에 뜬 시각(FE 20d3e3f, main.4d22ee66.js). 이보다 앞선 기록은 옛 랜딩이라 뺀다.
  startAt: "2026-09-29T01:22:57+09:00",
  v2Percent: 50,
  // 2026-09-29 배포 직후 운영 점검이 실제 기록으로 들어간 방문자 ID. 집계에서 뺀다.
  testVisitorIds: ["00000000-0000-4000-8000-000000000000", "11111111-1111-4111-8111-111111111111"],
};

/** FNV-1a 32비트. 문자 코드마다 XOR 뒤 0x01000193을 곱하고 32비트 부호 없는 값으로 자른다. */
const fnv1a32 = (text) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/** 방문자 ID → v1/v2. `landing-ab-1:` + visitorId의 해시를 100으로 나눈 칸이 50 미만이면 v2. */
const landingVariantFor = (visitorId) =>
  fnv1a32(`${LANDING_AB.key}:${visitorId}`) % 100 < LANDING_AB.v2Percent ? "v2" : "v1";

module.exports = { LANDING_AB, fnv1a32, landingVariantFor };
