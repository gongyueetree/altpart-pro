const test = require("node:test");
const assert = require("node:assert/strict");
const { formatValue, splitValueUnit } = require("../api/_lib/format");
const { normalizeLeadTime, classifyProductUrl, LEAD_TIME_MAX_DAYS } = require("../api/_lib/distributor");

test("ALT-007：单位不得重复显示", async t => {
  const cs = [
    ["64", "KB", "64 KB"], ["64 KB", "KB", "64 KB"], ["20 KB", "KB", "20 KB"],
    ["2.0 - 3.6 V", "V", "2.0 - 3.6 V"], ["72 MHz", "MHz", "72 MHz"],
    ["Sleep, Stop, Standby/2 µA", "µA", "Sleep, Stop, Standby/2 µA"],
    ["0°C ~ 70°C（TA）", "°C", "0°C ~ 70°C（TA）"],
    ["-40 to 85", "°C", "-40 to 85 °C"], ["±15", "V", "±15 V"],
    ["ARM Cortex-M3", "MHz", "ARM Cortex-M3"], ["N/A", "KB", "N/A"],
    ["LQFP-48", "", "LQFP-48"],
  ];
  for (const [v, u, want] of cs)
    await t.test(`"${v}" + "${u}" → "${want}"`, () => assert.equal(formatValue(v, u).text, want));

  await t.test("导出用的值/单位分列", () => {
    assert.deepEqual(splitValueUnit("64 KB", "KB"), { value: "64", unit: "KB" });
    assert.deepEqual(splitValueUnit("64", "KB"), { value: "64", unit: "KB" });
    assert.deepEqual(splitValueUnit("N/A", "KB"), { value: "N/A", unit: "" });
  });
});

test("ALT-006：交期单位统一与异常检测", async t => {
  await t.test("40 周 → 280 天", () => assert.equal(normalizeLeadTime(40, "weeks").days, 280));
  await t.test("280 天正常", () => assert.equal(normalizeLeadTime(280, "days").abnormal, false));
  await t.test("1960 天标记异常", () => {
    const r = normalizeLeadTime(1960, "days");
    assert.equal(r.abnormal, true);
    assert.match(r.note, /不参与排序/);
  });
  await t.test(`阈值为 ${LEAD_TIME_MAX_DAYS} 天`, () => {
    assert.equal(normalizeLeadTime(LEAD_TIME_MAX_DAYS, "days").abnormal, false);
    assert.equal(normalizeLeadTime(LEAD_TIME_MAX_DAYS + 1, "days").abnormal, true);
  });
  await t.test("字符串带单位", () => assert.equal(normalizeLeadTime("4 weeks", "weeks").days, 28));
  await t.test("空值不报错", () => assert.equal(normalizeLeadTime(null, "days").days, null));
  await t.test("月转天", () => assert.equal(normalizeLeadTime(2, "months").days, 60));
});

test("ALT-013：分销商页不得冒充制造商官网", async t => {
  const dist = ["https://www.digikey.com/en/products/detail/x", "https://www.mouser.com/ProductDetail/y",
    "https://www.szlcsc.com/product/1", "https://uk.farnell.com/z", "https://www.arrow.com/a"];
  for (const u of dist)
    await t.test(`${new URL(u).hostname} → 分销商`, () => {
      const r = classifyProductUrl(u);
      assert.equal(r.manufacturerUrl, null);
      assert.ok(r.distributorUrl);
    });
  const mfr = ["https://www.ti.com/product/LM358", "https://www.analog.com/en/products/ad8331.html",
    "https://www.st.com/en/x.html"];
  for (const u of mfr)
    await t.test(`${new URL(u).hostname} → 制造商`, () => {
      const r = classifyProductUrl(u);
      assert.ok(r.manufacturerUrl);
      assert.equal(r.distributorUrl, null);
    });
  await t.test("空 URL 不报错", () => assert.deepEqual(classifyProductUrl(""), { manufacturerUrl: null, distributorUrl: null }));
});

test("ALT-004：MPN 前缀优先于描述关键词", async t => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../api/_lib/pipeline.js"), "utf8");
  let code = "";
  for (const re of [/const MPN_CATEGORY[\s\S]*?\n\];/, /function categoryByMpn[\s\S]*?\n\}/,
                    /const PRIMARY_MARKERS[\s\S]*?\n\];/, /function normFunc[\s\S]*?\n\}/]) code += src.match(re)[0] + "\n";
  code += `inferCat=o=>{const b=categoryByMpn(o.partNumber);if(b)return b;
    const t=(o.description||"")+" "+(o.category||"");
    for(const[c,r]of PRIMARY_MARKERS)if(r.test(t))return c;
    return normFunc(o.description||"")||normFunc(o.category||"");};`;
  let inferCat; eval(code);

  const cs = [
    ["STM32F303CBT6", "Cortex-M4 MCU with comparators and op-amps", "mcu"],
    ["STM32F303RBT6", "MCU 含比较器 运算放大器", "mcu"],
    ["STM32F103C8T6", "主流增强型 Cortex-M3 MCU", "mcu"],
    ["GD32F103C8T6", "国产 Cortex-M3 微控制器", "mcu"],
    ["MM32F103CBT6", "灵动微 Cortex-M3 MCU", "mcu"],
    ["LM358ADR", "双通道运算放大器", "opamp"],
    ["LM393", "双比较器", "comparator"],
    ["AD8331ARQZ", "单通道可变增益放大器", "vga"],
  ];
  for (const [pn, desc, want] of cs)
    await t.test(`${pn} → ${want}`, () => assert.equal(inferCat({ partNumber: pn, description: desc }), want));
});
