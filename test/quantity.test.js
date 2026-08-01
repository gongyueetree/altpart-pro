const test = require("node:test");
const assert = require("node:assert/strict");
const { toQuantityIR, comparable, conditionMatch, parseUnit } = require("../api/_lib/quantity");

const canon = (v, u) => toQuantityIR(v, u).canonicalTyp;
const eq = (a, b) => {
  const x = toQuantityIR(a[0], a[1]), y = toQuantityIR(b[0], b[1]);
  return comparable(x, y) && Math.abs(x.canonicalTyp - y.canonicalTyp) < 1e-9;
};

test("P0 必修：跨单位等值判定", async t => {
  await t.test("72 MHz == 72,000,000 Hz", () => assert.ok(eq(["72", "MHz"], ["72000000", "Hz"])));
  await t.test("3.3 V == 3300 mV", () => assert.ok(eq(["3.3", "V"], ["3300", "mV"])));
  await t.test("1 A == 1000 mA", () => assert.ok(eq(["1", "A"], ["1000", "mA"])));
  await t.test("10 kΩ == 10000 Ω", () => assert.ok(eq(["10", "kΩ"], ["10000", "Ω"])));
  await t.test("100 nF == 0.1 µF", () => assert.ok(eq(["100", "nF"], ["0.1", "µF"])));
  await t.test("值内自带单位也生效", () => assert.ok(eq(["72 MHz", ""], ["72000000 Hz", ""])));
});

test("SI 前缀换算", async t => {
  const cs = [["1", "GHz", 1e9], ["1", "MHz", 1e6], ["1", "kHz", 1e3], ["1", "Hz", 1],
    ["1", "mV", 1e-3], ["1", "uV", 1e-6], ["1", "µV", 1e-6], ["1", "nV", 1e-9], ["1", "pF", 1e-12],
    ["1", "mA", 1e-3], ["1", "kΩ", 1e3], ["1", "MΩ", 1e6], ["1", "mW", 1e-3], ["1", "nC", 1e-9]];
  for (const [v, u, want] of cs) await t.test(`${v}${u} = ${want}`, () => assert.equal(canon(v, u), want));
});

test("存储单位 SI 与 binary 必须区分", async t => {
  await t.test("64 KB = 64000 B (SI)", () => assert.equal(canon("64", "KB"), 64000));
  await t.test("64 KiB = 65536 B (binary)", () => assert.equal(canon("64", "KiB"), 65536));
  await t.test("1 MB = 1e6 B", () => assert.equal(canon("1", "MB"), 1e6));
  await t.test("1 MiB = 1048576 B", () => assert.equal(canon("1", "MiB"), 1048576));
  await t.test("KB 与 KiB 不相等", () => assert.notEqual(canon("64", "KB"), canon("64", "KiB")));
});

test("范围解析", async t => {
  await t.test("2.0 to 3.6 V", () => { const q = toQuantityIR("2.0 to 3.6", "V");
    assert.equal(q.min, 2); assert.equal(q.max, 3.6); assert.ok(q.isRange); });
  await t.test("负温度范围 -40 to 125", () => { const q = toQuantityIR("-40 to 125", "°C");
    assert.equal(q.min, -40); assert.equal(q.max, 125); });
  await t.test("波浪号 -40~85", () => { const q = toQuantityIR("-40~85", "°C");
    assert.equal(q.min, -40); assert.equal(q.max, 85); });
  await t.test("±15 V", () => { const q = toQuantityIR("±15", "V");
    assert.equal(q.min, -15); assert.equal(q.max, 15); });
});

test("N/A 与空值", async t => {
  for (const v of ["N/A", "n/a", "NA", "-", "—", "", null, undefined, "TBD", "未知"])
    await t.test(`${JSON.stringify(v)} → known=false`, () => assert.equal(toQuantityIR(v, "V").known, false));
});

test("测试条件解析与比对", async t => {
  await t.test("解析 @ 条件", () => { const q = toQuantityIR("12 mΩ @ Vgs=10V");
    assert.equal(q.canonicalTyp, 0.012); assert.equal(q.condition.Vgs, "10V"); });
  await t.test("条件不同被识别", () => {
    const r = conditionMatch(toQuantityIR("12 mΩ @ Vgs=10V"), toQuantityIR("8 mΩ @ Vgs=4.5V"));
    assert.equal(r.same, false); assert.equal(r.checked, true); });
  await t.test("条件相同", () => {
    const r = conditionMatch(toQuantityIR("12 mΩ @ Vgs=10V"), toQuantityIR("8 mΩ @ Vgs=10V"));
    assert.equal(r.same, true); });
  await t.test("多条件 Dropout", () => { const q = toQuantityIR("200 mV @ Iout=1A");
    assert.equal(q.canonicalTyp, 0.2); assert.equal(q.condition.Iout, "1A"); });
});

test("量纲不同不可比较", async t => {
  await t.test("V 与 A 不可比", () =>
    assert.equal(comparable(toQuantityIR("5", "V"), toQuantityIR("5", "A")), false));
  await t.test("Hz 与 V 不可比", () =>
    assert.equal(comparable(toQuantityIR("5", "MHz"), toQuantityIR("5", "V")), false));
  await t.test("同量纲可比", () =>
    assert.equal(comparable(toQuantityIR("5", "V"), toQuantityIR("5000", "mV")), true));
});

test("单位识别", async t => {
  await t.test("未知单位返回 null", () => assert.equal(parseUnit("widgets"), null));
  await t.test("Ω 与 ohm 等价", () => assert.equal(parseUnit("kΩ").mul, parseUnit("kohm").mul));
});
