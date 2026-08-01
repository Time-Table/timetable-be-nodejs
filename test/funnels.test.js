const test = require("node:test");
const assert = require("node:assert/strict");
const { EVENTS, EVENT_NAMES, FUNNELS, MATURITY_FUNNEL } = require("../utils/funnels");

/**
 * 퍼널 정의가 깨지면 매니저 페이지의 숫자가 조용히 틀려진다.
 * 화면에는 그럴듯한 값이 나오기 때문에 사람이 알아채기 어렵다.
 */

test("이벤트 이름은 중복 없이 유일하다", () => {
  assert.equal(new Set(EVENT_NAMES).size, EVENT_NAMES.length);
});

test("퍼널의 모든 단계는 정의된 이벤트를 가리킨다", () => {
  FUNNELS.forEach((funnel) => {
    funnel.steps.forEach((step) => {
      assert.ok(
        EVENT_NAMES.includes(step.event),
        `${funnel.key}의 '${step.label}' 단계가 정의되지 않은 이벤트 '${step.event}'를 가리킵니다`,
      );
    });
  });
});

test("퍼널 안에서 같은 단계가 두 번 나오지 않는다", () => {
  FUNNELS.forEach((funnel) => {
    const events = funnel.steps.map((s) => s.event);
    assert.equal(new Set(events).size, events.length, `${funnel.key}에 중복 단계가 있습니다`);
  });
});

test("모든 퍼널과 단계에 설명이 붙어 있다", () => {
  [...FUNNELS, MATURITY_FUNNEL].forEach((funnel) => {
    assert.ok(funnel.title, `${funnel.key}에 title이 없습니다`);
    assert.ok(funnel.unit, `${funnel.key}에 unit이 없습니다`);
    assert.ok(funnel.question, `${funnel.key}에 question이 없습니다`);
    assert.ok(funnel.meaning, `${funnel.key}에 meaning이 없습니다`);

    funnel.steps.forEach((step) => {
      assert.ok(step.label, `${funnel.key}의 단계에 label이 없습니다`);
      assert.ok(step.meaning, `${funnel.key}의 '${step.label}'에 meaning이 없습니다`);
    });
  });
});

test("성숙도 퍼널의 임계값은 오름차순이다", () => {
  const thresholds = MATURITY_FUNNEL.steps.map((s) => s.threshold);
  assert.deepEqual(
    thresholds,
    [...thresholds].sort((a, b) => a - b),
    "임계값이 오름차순이 아니면 퍼널이 아래로 갈수록 넓어지는 이상한 모양이 됩니다",
  );
});

test("계측 코드가 참조하는 이벤트가 정의에 존재한다", () => {
  // 프론트엔드 utils/analytics.js의 EVENTS와 짝이 맞아야 한다.
  const required = [
    "landing_view",
    "create_cta_click",
    "create_view",
    "create_submit",
    "create_success",
    "invite_share",
    "table_view",
    "join_submit",
    "join_success",
    "schedule_save",
    "ranking_open",
  ];
  required.forEach((name) => {
    assert.ok(EVENT_NAMES.includes(name), `프론트가 보내는 '${name}'가 백엔드 정의에 없습니다`);
  });
  assert.equal(Object.keys(EVENTS).length, required.length);
});
