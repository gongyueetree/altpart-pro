const test = require("node:test");
const assert = require("node:assert/strict");
const { manufacturerOrigin, isDomesticManufacturer } = require("../api/_lib/manufacturers");

test("线上误判：中国厂商被判为非国产", async t => {
  const cn = [
    ["XLSEMI", "芯龙半导体"], ["Changjiang Electronics Technology Co., Ltd (CET)", "长电"],
    ["SGMicro", "圣邦微"], ["3PEAK", "思瑞浦"], ["GigaDevice", "兆易创新"],
    ["Silergy", "矽力杰"], ["NOVOSENSE", "纳芯微"], ["Runic Technology", "润石"],
    ["Awinic", "艾为"], ["Injoinic", "英集芯"], ["JoulWatt", "杰华特"],
  ];
  for (const [m, note] of cn)
    await t.test(`${m}（${note}）→ 国产`, () => {
      const r = isDomesticManufacturer(m);
      assert.equal(r.pass, true, `实际 ${r.origin}`);
    });
});

test("台湾厂商默认计入国产，可关闭", async t => {
  const tw = [["UTC", "友顺"], ["Unisonic Technology", "友顺"], ["Holtek", "合泰"], ["Sitronix", "硅创"]];
  for (const [m, note] of tw) {
    await t.test(`${m}（${note}）默认计入`, () =>
      assert.equal(isDomesticManufacturer(m).pass, true));
    await t.test(`${m} includeTaiwan=false 时排除`, () =>
      assert.equal(isDomesticManufacturer(m, "", { includeTaiwan: false }).pass, false));
  }
});

test("境外厂商明确排除", async t => {
  for (const m of ["Texas Instruments", "Analog Devices", "ON Semiconductor",
                   "STMicroelectronics", "Infineon", "Hittite Microwave", "Nexperia"])
    await t.test(`${m} → 境外`, () => {
      const r = isDomesticManufacturer(m);
      assert.equal(r.pass, false);
      assert.equal(r.origin, "OVERSEAS");
    });
});

test("未知厂商不武断排除（默认待核验）", async t => {
  await t.test("默认返回 null（待核验）", () => {
    const r = isDomesticManufacturer("某某未收录半导体");
    assert.equal(r.pass, null);
    assert.equal(r.origin, "UNKNOWN");
    assert.match(r.reason, /未收录|人工确认/);
  });
  await t.test("strict 模式下按非国产处理", () =>
    assert.equal(isDomesticManufacturer("某某未收录半导体", "", { strict: true }).pass, false));
  await t.test("空厂商名 → UNKNOWN", () =>
    assert.equal(manufacturerOrigin("").origin, "UNKNOWN"));
});

test("大小写与标点不影响判定", async t => {
  await t.test("大小写", () =>
    assert.equal(manufacturerOrigin("sgmicro").origin, manufacturerOrigin("SGMicro").origin));
  await t.test("带 Co., Ltd.", () =>
    assert.equal(manufacturerOrigin("SG Micro Corp., Ltd.").origin, "CN"));
  await t.test("中文名", () => assert.equal(manufacturerOrigin("圣邦微电子").origin, "CN"));
});
