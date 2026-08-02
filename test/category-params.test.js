const test = require("node:test");
const assert = require("node:assert/strict");
const { organizeParams, detectCategory, CATEGORY_TEMPLATES } = require("../api/_lib/category-params");

const P = (name, value, source = "ezplm") => ({ id: name, name, value, source });

test("品类识别", async t => {
  const cs = [
    ["单通道VGA 可变增益放大器", "vga"], ["运算放大器 双通道", "opamp"],
    ["仪表放大器", "inamp"], ["LDO 线性稳压器", "ldo"],
    ["DC-DC 降压转换器", "dcdc"], ["微控制器 Cortex-M3", "mcu"],
    ["16位 ADC 模数转换", "adc"], ["N沟道 MOSFET", "mosfet"],
    ["I/Q 解调器", "demod"], ["未知器件", null],
  ];
  for (const [text, want] of cs)
    await t.test(`${text} → ${want}`, () => assert.equal(detectCategory(text), want));
});

test("线上缺陷：中英重复占满参数位", async t => {
  const raw = [
    P("类型", "可变增益放大器"), P("应用", "信号处理"), P("封装", "SSOP-20_3.9x8.65mm"),
    P("Type", "Variable Gain Amplifier", "digikey"), P("Applications", "Signal Processing", "digikey"),
    P("Package / Case", "SSOP-20", "digikey"), P("Supplier Device Package", "SSOP-20", "digikey"),
    P("增益", "-4.5 dB 至 +43.5 dB"), P("-3dB带宽", "120 MHz"),
    P("前置放大器噪声", "0.74 nV/√Hz"), P("供电电压", "5 V"), P("功耗", "125 mW"),
  ];
  const r = organizeParams(raw, "单通道VGA 可变增益放大器");
  await t.test("识别为 VGA", () => assert.equal(r.category, "vga"));
  await t.test("重复项被合并（12 → 8）", () => assert.equal(r.params.length + r.dropped.length, 8));
  const names = r.params.map(p => p.name);
  await t.test("Type 不与 类型 并存", () => assert.ok(!(names.includes("类型") && names.includes("Type"))));
  await t.test("Package/Case 与 Supplier Device Package 不与 封装 并存", () =>
    assert.equal(names.filter(n => /封装|Package/i.test(n)).length, 1));
  await t.test("技术参数排在通用字段之前", () => {
    assert.ok(names.indexOf("增益") < names.indexOf("应用"));
    assert.ok(names.indexOf("-3dB带宽") < names.indexOf("应用"));
  });
  await t.test("增益排第一", () => assert.equal(names[0], "增益"));
  await t.test("列出模板中仍缺的参数", () => assert.ok(r.missingTemplateParams.includes("通道数")));
});

test("权威来源优先保留", async t => {
  const raw = [P("封装", "SSOP-20_3.9x8.65mm_P0.635mm", "ezplm"), P("Package / Case", "SSOP-20", "digikey")];
  const r = organizeParams(raw, "运算放大器");
  await t.test("保留 ezPLM 的更详细值", () => assert.match(String(r.params[0].value), /3\.9x8\.65/));
});

test("N/A 与通用字段排到最后", async t => {
  const raw = [P("应用", "信号处理"), P("增益带宽积", "N/A"), P("输入失调电压", "0.5 mV"), P("包装", "Tube")];
  const r = organizeParams(raw, "运算放大器");
  const names = [...r.params, ...r.dropped].map(p => p.name);
  await t.test("有值技术参数在前", () => assert.equal(names[0], "输入失调电压"));
  await t.test("N/A 参数不在首位", () => assert.notEqual(names[0], "增益带宽积"));
});

test("每个模板都有 label 与至少 8 项参数", async t => {
  for (const [k, v] of Object.entries(CATEGORY_TEMPLATES))
    await t.test(`${k} 模板完整`, () => { assert.ok(v.label); assert.ok(v.params.length >= 8); });
});
