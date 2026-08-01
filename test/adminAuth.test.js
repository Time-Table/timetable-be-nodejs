const test = require("node:test");
const assert = require("node:assert/strict");
const { safeEqual } = require("../middlewares/adminAuth");

test("safeEqual은 같은 문자열에만 true를 준다", () => {
  assert.equal(safeEqual("0222", "0222"), true);
  assert.equal(safeEqual("0222", "0223"), false);
  assert.equal(safeEqual("", ""), true);
});

test("safeEqual은 길이가 달라도 예외 없이 false를 준다", () => {
  // 해시로 길이를 맞추지 않으면 timingSafeEqual이 예외를 던진다.
  assert.equal(safeEqual("short", "a-much-longer-secret"), false);
  assert.equal(safeEqual("a-much-longer-secret", "short"), false);
});

test("safeEqual은 문자열이 아닌 입력을 false로 처리한다", () => {
  assert.equal(safeEqual(undefined, "x"), false);
  assert.equal(safeEqual("x", undefined), false);
  assert.equal(safeEqual(null, null), false);
  assert.equal(safeEqual(1234, 1234), false);
});

test("safeEqual은 접두사가 같아도 통과시키지 않는다", () => {
  assert.equal(safeEqual("0222", "02220"), false);
  assert.equal(safeEqual("02220", "0222"), false);
});
