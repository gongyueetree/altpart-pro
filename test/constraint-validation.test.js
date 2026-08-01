const test = require("node:test");
const assert = require("node:assert/strict");
const { validateConstraint } = require("../api/_lib/scoring-node");

const P = (name, unit = "", nameEn = "") => ({ id: "p", name, nameEn, unit });

test("P1：非法约束必须被拒绝", async t => {
  await t.test("min > max 被拒（线上曾接受 min=6 max=4）", () => {
    const r = validateConstraint({ constraintType: "hard", min: "6", max: "4" }, P("增益", "dB"));
    assert.equal(r.valid, false); assert.match(r.error, /不得大于/);
  });
  await t.test("min == max 允许", () =>
    assert.equal(validateConstraint({ constraintType: "hard", min: "5", max: "5" }, P("增益", "dB")).valid, true));
  await t.test("跨单位比较正确（1V vs 500mV → 非法）", () => {
    const r = validateConstraint({ constraintType: "hard", min: "1 V", max: "500 mV" }, P("电压", "V"));
    assert.equal(r.valid, false);
  });
  await t.test("无法解析的值被拒", () =>
    assert.equal(validateConstraint({ constraintType: "hard", min: "abc" , max: "5" }, P("增益", "dB")).valid, false));
  await t.test("未知约束类型被拒", () =>
    assert.equal(validateConstraint({ constraintType: "weird" }, P("增益")).valid, false));
});

test("P1：离散参数不得使用数值范围", async t => {
  await t.test("封装用 min/max 被拒", () => {
    const r = validateConstraint({ constraintType: "hard", min: "1", max: "8" }, P("封装", "", "Package"));
    assert.equal(r.valid, false); assert.match(r.error, /离散|集合/);
  });
  await t.test("封装用 options 通过", () =>
    assert.equal(validateConstraint({ constraintType: "hard", options: ["SOIC-8"] }, P("封装", "", "Package")).valid, true));
  await t.test("空 options 被拒", () =>
    assert.equal(validateConstraint({ constraintType: "hard", options: [] }, P("封装", "", "Package")).valid, false));
  await t.test("数值参数用 min/max 通过", () =>
    assert.equal(validateConstraint({ constraintType: "hard", min: "1", max: "10" }, P("增益带宽积", "MHz")).valid, true));
});

test("无约束直接通过", async t => {
  await t.test("空约束", () => assert.equal(validateConstraint(null, P("x")).valid, true));
  await t.test("constraintType 缺失", () => assert.equal(validateConstraint({ min: "1" }, P("x")).valid, true));
});
