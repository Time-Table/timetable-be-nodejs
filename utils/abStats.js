/**
 * A/B 판정에 쓰는 통계 몇 가지(2026-09-29 랜딩 A/B 1회차). 비율은 모두 0~1로 다룬다.
 * 판정 규칙은 하네스 specs/product.md "랜딩 A/B 1회차"와 specs/landing-ab-manager.md 7번이 정본이다.
 */
const Z95 = 1.959963984540054;

/** Wilson 95% 구간. 표본이 없으면 null. */
const wilson = (successes, total, z = Z95) => {
  if (!(total > 0)) return null;
  const p = successes / total;
  const z2 = z * z;
  const center = (p + z2 / (2 * total)) / (1 + z2 / total);
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / (1 + z2 / total);
  return [Math.max(0, center - half), Math.min(1, center + half)];
};

/**
 * 두 비율의 차이(b − a)와 Newcombe 95% 구간(Wilson 두 개로 만든 차이 구간, Newcombe 1998 방법 10).
 * 한쪽이라도 표본이 없으면 null.
 */
const newcombe = (aSuccess, aTotal, bSuccess, bTotal) => {
  const a = wilson(aSuccess, aTotal);
  const b = wilson(bSuccess, bTotal);
  if (!a || !b) return null;
  const pa = aSuccess / aTotal;
  const pb = bSuccess / bTotal;
  const diff = pb - pa;
  const lower = diff - Math.sqrt((pb - b[0]) ** 2 + (a[1] - pa) ** 2);
  const upper = diff + Math.sqrt((b[1] - pb) ** 2 + (pa - a[0]) ** 2);
  return { diff, ci: [lower, upper] };
};

/** 여오차함수 erfc. Numerical Recipes erfcc(상대 오차 1.2e-7 이하). */
const erfc = (x) => {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
};

/**
 * 배정 비율 점검(SRM). 두 쪽 노출 수를 기대 비율(b 쪽 몫)과 카이제곱(자유도 1)으로 비교한 p값.
 * 노출이 없으면 null.
 */
const srmPValue = (aCount, bCount, bShare = 0.5) => {
  const total = aCount + bCount;
  if (!(total > 0)) return null;
  const expectedA = total * (1 - bShare);
  const expectedB = total * bShare;
  const chi2 = (aCount - expectedA) ** 2 / expectedA + (bCount - expectedB) ** 2 / expectedB;
  return Math.min(1, erfc(Math.sqrt(chi2 / 2)));
};

/** 판정 기준(사람 결정, 2026-09-29). */
const VERDICT_RULE = { srmAlpha: 0.01, minExposed: 100, minSuccess: 10 };

/**
 * 판정. 위에서부터 처음 맞는 것:
 * srm_alert(SRM p < 0.01) → insufficient(한쪽 노출 < 100 또는 성공 < 10) → no_difference(차이 구간이 0 포함) → v2_better/v1_better.
 */
const verdictFor = ({ srm, v1, v2, difference }) => {
  if (srm !== null && srm < VERDICT_RULE.srmAlpha) return "srm_alert";
  if ([v1, v2].some((s) => s.exposed < VERDICT_RULE.minExposed || s.success < VERDICT_RULE.minSuccess)) {
    return "insufficient";
  }
  if (!difference || (difference.ci[0] <= 0 && difference.ci[1] >= 0)) return "no_difference";
  return difference.diff > 0 ? "v2_better" : "v1_better";
};

module.exports = { wilson, newcombe, erfc, srmPValue, verdictFor, VERDICT_RULE };
