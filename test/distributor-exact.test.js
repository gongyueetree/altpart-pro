const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { splitMpn } = require("../api/_lib/part-identity");
const { inferUnit } = require("../api/_lib/category-params");

// pickExact 是模块内私有函数，从源码提取测试
const src = fs.readFileSync(require.resolve("../api/_lib/distributor.js"), "utf8");
eval(src.match(/function pickExact[\s\S]*?\n\}/)[0]);
const M = x => x.mpn, F = x => x.mfr;

test("P0：分销商模糊结果不得冒充精确匹配", async t => {
  await t.test("搜 TL431 返回液位传感器 → 拒绝", () => {
    // 线上真实现象：参数出现 "Material - Housing & Prism: 316 Stainless Steel"
    const wrong = [{ mpn: "LLE102000", mfr: "Gems Sensors" }, { mpn: "ELS-1100", mfr: "SST Sensing" }];
    assert.equal(pickExact(wrong, "TL431", M, F), null);
  });
  await t.test("完全不相干结果 → 拒绝", () =>
    assert.equal(pickExact([{ mpn: "CONN-HDR-10", mfr: "Molex" }], "LM358ADR", M, F), null));
  await t.test("空列表 → null", () => assert.equal(pickExact([], "LM358", M, F), null));
});

test("精确匹配仍正常工作", async t => {
  const list = [{ mpn: "TL431ACDBZR", mfr: "TI" }, { mpn: "TL431ACDBVR", mfr: "TI" }];
  await t.test("完全相同", () => assert.equal(pickExact(list, "TL431ACDBVR", M, F).mpn, "TL431ACDBVR"));
  await t.test("包装后缀差异", () =>
    assert.equal(pickExact([{ mpn: "TPS62160DGKR", mfr: "TI" }], "TPS62160DGKR-REEL", M, F).mpn, "TPS62160DGKR"));
  await t.test("同基础器件可作变体", () => assert.ok(pickExact(list, "TL431", M, F)));
  await t.test("基础器件太短不匹配（防误配）", () =>
    assert.equal(pickExact([{ mpn: "R10", mfr: "X" }], "R1", M, F), null));
});

test("无单位参数按参数名推断", async t => {
  const cs = [
    ["输入偏置电流", "150000", "nA"], ["等效输入噪声电压", "55", "nV/√Hz"],
    ["供电电压", "32", "V"], ["工作温度", "70", "°C"],
    ["增益带宽积", "1.1", "MHz"], ["压摆率", "0.6", "V/µs"],
    ["静态电流", "700", "µA"], ["导通电阻", "12", "mΩ"],
  ];
  for (const [name, value, unit] of cs)
    await t.test(`${name} ${value} → ${unit}`, () => {
      const r = inferUnit({ name, value });
      assert.equal(r.unit, unit); assert.equal(r.unitInferred, true);
    });

  await t.test("值里已有单位不覆盖", () =>
    assert.equal(inferUnit({ name: "供电电压", value: "3 to 32 V" }).unit, undefined));
  await t.test("无量纲参数不加单位", () =>
    assert.equal(inferUnit({ name: "通道数", value: "2" }).unit, undefined));
  await t.test("文本值不加单位", () =>
    assert.equal(inferUnit({ name: "封装", value: "SOT-23-5" }).unit, undefined));
  await t.test("已有单位保持不变", () =>
    assert.equal(inferUnit({ name: "供电电压", value: "5", unit: "V" }).unitInferred, undefined));
});
