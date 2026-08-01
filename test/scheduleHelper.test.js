const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateTimeInfo, calculateSimpleTimeInfo } = require("../utils/scheduleHelper");
const { COLOR_VALUES } = require("../utils/constants");

/**
 * 골든타임 계산은 이 서비스의 핵심 결과물이다.
 * 여기가 틀리면 사용자가 잘못된 시간에 모인다.
 */

const at = (time) => (row) => row.time === time;

test("아무도 없으면 빈 결과를 준다", () => {
  assert.deepEqual(calculateTimeInfo([]), []);
});

test("겹치는 시간의 인원과 멤버를 정확히 센다", () => {
  const users = [
    { name: "가", availableTimes: ["2026-08-01-10:00", "2026-08-01-11:00"] },
    { name: "나", availableTimes: ["2026-08-01-10:00"] },
    { name: "다", availableTimes: ["2026-08-01-10:00"] },
  ];

  const result = calculateTimeInfo(users);
  const ten = result.find(at("2026-08-01-10:00"));
  const eleven = result.find(at("2026-08-01-11:00"));

  assert.equal(ten.count, 3);
  assert.deepEqual(ten.members.sort(), ["가", "나", "다"]);
  assert.equal(eleven.count, 1);
  assert.deepEqual(eleven.members, ["가"]);
});

test("일정을 입력하지 않은 참여자도 분모에 포함된다", () => {
  // 참여만 하고 시간을 안 고른 사람이 있으면 비율이 낮아져야 한다.
  const users = [
    { name: "가", availableTimes: ["T1"] },
    { name: "나", availableTimes: [] },
    { name: "다" },
  ];

  const result = calculateTimeInfo(users);
  // 3명 중 1명 = 33.3% → LOW 구간
  assert.equal(result.find(at("T1")).count, 1);
  assert.equal(result.find(at("T1")).colorNumber, COLOR_VALUES.LOW);
});

test("전원이 가능하면 최고 색상 단계가 된다", () => {
  const users = [
    { name: "가", availableTimes: ["T1"] },
    { name: "나", availableTimes: ["T1"] },
  ];
  assert.equal(calculateTimeInfo(users).find(at("T1")).colorNumber, COLOR_VALUES.MAX);
});

test("calculateSimpleTimeInfo는 멤버 이름을 노출하지 않는다", () => {
  const users = [{ name: "가", availableTimes: ["T1"] }];
  const result = calculateSimpleTimeInfo(users);

  assert.deepEqual(Object.keys(result[0]).sort(), ["colorNumber", "time"]);
});

test("두 계산 함수의 색상 단계가 일치한다", () => {
  const users = [
    { name: "가", availableTimes: ["T1", "T2"] },
    { name: "나", availableTimes: ["T1"] },
    { name: "다", availableTimes: ["T1"] },
  ];

  const full = calculateTimeInfo(users);
  const simple = calculateSimpleTimeInfo(users);

  full.forEach((row) => {
    const match = simple.find(at(row.time));
    assert.equal(row.colorNumber, match.colorNumber, `${row.time}의 색상 단계가 서로 다릅니다`);
  });
});
