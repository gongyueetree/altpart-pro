const test = require("node:test");
const assert = require("node:assert/strict");
const { normPin, samePin } = require("../api/_lib/pin-normalize");

test("引脚号规范化", async t => {
  const cs = [["3", "3"], [3, "3"], [" 3 ", "3"], ["03", "3"], ["003", "3"],
    ["EP", "EP"], ["ep", "EP"], ["E.P.", "EP"], ["PAD", "EP"], ["ThermalPad", "EP"], ["EXPOSEDPAD", "EP"],
    ["NC", "NC"], ["nc", "NC"], ["N.C.", "NC"], ["DNC", "NC"],
    ["A1", "A1"], ["a1", "A1"], ["", ""], [null, ""], [undefined, ""]];
  for (const [input, want] of cs)
    await t.test(`${JSON.stringify(input)} → ${JSON.stringify(want)}`, () => assert.equal(normPin(input), want));
});

test("符号 ↔ 封装 双向匹配", async t => {
  await t.test("符号 '3' 匹配封装 3", () => assert.equal(samePin("3", 3), true));
  await t.test("封装 '03' 匹配符号 3", () => assert.equal(samePin("03", "3"), true));
  await t.test("EP 与 PAD 视为同一散热焊盘", () => assert.equal(samePin("EP", "PAD"), true));
  await t.test("EP 与 ThermalPad", () => assert.equal(samePin("E.P.", "ThermalPad"), true));
  await t.test("BGA A1 大小写", () => assert.equal(samePin("A1", "a1"), true));
  await t.test("3 与 5 不匹配", () => assert.equal(samePin("3", "5"), false));
  await t.test("空值不匹配任何引脚", () => {
    assert.equal(samePin("", "3"), false);
    assert.equal(samePin(null, null), false);
  });
  await t.test("NC 与 EP 不混淆", () => assert.equal(samePin("NC", "EP"), false));
});

test("LM358 多单元场景（提示词 §6 E2E 断言的逻辑层）", async t => {
  // A单元 pin 3/2/1，B单元 5/6/7，C电源 8/4
  const units = { 1: ["3", "2", "1"], 2: ["5", "6", "7"], 3: ["8", "4"] };
  const unitOf = pin => Object.entries(units).find(([, ps]) => ps.some(p => samePin(p, pin)))?.[0];
  await t.test("点符号 A 单元 pin3 → 封装 pad3 命中", () => assert.equal(samePin("3", 3), true));
  await t.test("点封装 pad5 → 应定位到 B 单元", () => assert.equal(unitOf("5"), "2"));
  await t.test("点封装 pad8 → 应定位到 C 电源单元", () => assert.equal(unitOf("8"), "3"));
  await t.test("pad4 在 C 单元", () => assert.equal(unitOf("4"), "3"));
  await t.test("不存在的 pin 返回 undefined", () => assert.equal(unitOf("99"), undefined));
});
