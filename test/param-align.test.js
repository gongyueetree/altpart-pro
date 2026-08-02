const test = require("node:test");
const assert = require("node:assert/strict");
const { alignParams, alignReport, sameParam, normalizeName } = require("../api/_lib/param-align");

test("名称归一化", async t => {
  const cs = [
    ["输入噪声密度[典型值](nV/√Hz)", "输入噪声密度"],
    ["工作温度[范围](°C)", "工作温度"],
    ["Supply Voltage (V)", "supplyvoltage"],
    ["Iq[典型值](µA)", "iq"],
    ["输出电流[最大值](A)", "输出电流"],
  ];
  for (const [input, want] of cs)
    await t.test(`${input} → ${want}`, () => assert.equal(normalizeName(input), normalizeName(want)));
});

test("同义参数识别", async t => {
  const same = [
    ["等效输入噪声", "输入噪声密度[典型值](nV/√Hz)"],
    ["工作温度", "工作温度[范围](°C)"],
    ["供电电压范围", "电源电压[最小值](V)"],
    ["通道数", "通道数量"],
    ["静态电流", "Quiescent Current"],
    ["封装", "Package / Case"],
    ["增益带宽积", "GBW"],
  ];
  for (const [a, b] of same)
    await t.test(`${a} ≡ ${b}`, () => assert.equal(sameParam(a, b), true));

  const diff = [
    ["增益", "增益带宽积"], ["工作温度", "工作电压"], ["静态电流", "输出电流"],
    ["输入失调电压", "输出电压"], ["分辨率", "采样率"],
  ];
  for (const [a, b] of diff)
    await t.test(`${a} ≠ ${b}`, () => assert.equal(sameParam(a, b), false));
});

test("线上缺陷：ezPLM 候选覆盖率 33% → 应为 100%", async t => {
  const ref = [
    { id: "p1", name: "等效输入噪声", nameEn: "Input Noise Density", unit: "nV/√Hz" },
    { id: "p2", name: "工作温度", nameEn: "Operating Temperature", unit: "°C" },
    { id: "p3", name: "输入失调电压", nameEn: "Input Offset Voltage", unit: "mV" },
    { id: "p4", name: "封装", nameEn: "Package", unit: "" },
    { id: "p5", name: "通道数", nameEn: "Channels", unit: "" },
    { id: "p6", name: "供电电压范围", nameEn: "Supply Voltage Range", unit: "V" },
  ];
  const cand = [
    { name: "输入噪声密度[典型值](nV/√Hz)", value: "0.74" },
    { name: "工作温度[范围](°C)", value: "-40 to 85" },
    { name: "输入失调电压[最大值](mV)", value: "20" },
    { name: "封装", value: "QFN-32-1EP_5x5mm" },
    { name: "通道数量", value: "2" },
    { name: "电源电压[最小值](V)", value: "4.5 to 5.5" },
  ];
  const r = alignReport(cand, ref);
  await t.test("覆盖率 100%", () => assert.equal(r.coverage, 100));
  await t.test("无未匹配项", () => assert.equal(r.missing.length, 0));
  await t.test("噪声值正确对齐", () => assert.equal(r.aligned.p1.value, "0.74"));
  await t.test("通道数对齐到「通道数量」", () => assert.equal(r.aligned.p5.value, "2"));
});

test("一对一匹配，同一候选参数不被重复使用", async t => {
  const ref = [{ id: "a", name: "增益", unit: "dB" }, { id: "b", name: "增益带宽积", unit: "MHz" }];
  const cand = [{ name: "增益带宽积[典型值](MHz)", value: "120" }];
  const aligned = alignParams(cand, ref);
  await t.test("增益带宽积匹配", () => assert.equal(aligned.b.value, "120"));
  await t.test("增益不误配", () => assert.equal(aligned.a.value, "N/A"));
});

test("无匹配返回 N/A 且来源为空", async t => {
  const aligned = alignParams([{ name: "无关参数", value: "1" }], [{ id: "x", name: "增益带宽积", unit: "MHz" }]);
  await t.test("值为 N/A", () => assert.equal(aligned.x.value, "N/A"));
  await t.test("来源为空（不得伪装成 ezPLM）", () => assert.equal(aligned.x.source, ""));
});
