const test = require("node:test");
const assert = require("node:assert/strict");
const { applyProfile, isDomestic, weightsFor, PROFILES } = require("../api/_lib/rule-profiles");

const original = { parameters: [
  { id: "pkg", name: "封装", nameEn: "Package", value: "SOIC-8", unit: "" },
  { id: "price", name: "参考价格", nameEn: "Price", value: "0.25", unit: "USD" },
]};
const mk = (pkgScore, pkgVal, extra = {}) => ({
  original,
  candidate: { manufacturer: extra.mfr || "Texas Instruments", parameters: { pkg: { value: pkgVal } }, market: extra.market },
  scoreResult: { evidenceCoverage: extra.cov ?? 80,
    paramScores: [{ paramId: "pkg", known: pkgVal !== "N/A", score: pkgScore }] },
});

test("Pin-to-Pin：封装必须完全一致", async t => {
  await t.test("同封装通过", () => assert.equal(applyProfile("pin2pin", mk(100, "SOIC-8")).pass, true));
  await t.test("兼容族被拒绝", () => {
    const r = applyProfile("pin2pin", mk(80, "SOP-8"));
    assert.equal(r.pass, false); assert.match(r.reason, /封装完全一致/);
  });
  await t.test("不同封装被拒绝", () => assert.equal(applyProfile("pin2pin", mk(12, "QFN-16")).pass, false));
  await t.test("封装未知被拒绝", () => assert.equal(applyProfile("pin2pin", mk(null, "N/A")).pass, false));
});

test("封装兼容：接受同族", async t => {
  await t.test("同封装通过", () => assert.equal(applyProfile("pkgCompat", mk(100, "SOIC-8")).pass, true));
  await t.test("兼容族通过", () => assert.equal(applyProfile("pkgCompat", mk(80, "SOP-8")).pass, true));
  await t.test("不同封装拒绝", () => assert.equal(applyProfile("pkgCompat", mk(12, "QFN-16")).pass, false));
});

test("国产替代：非国产必须拒绝", async t => {
  await t.test("TI 被拒绝", () => {
    const r = applyProfile("domestic", mk(100, "SOIC-8", { mfr: "Texas Instruments" }));
    assert.equal(r.pass, false); assert.match(r.reason, /境外厂商|非国产/);
  });
  const cn = ["兆易创新 (GigaDevice)", "沁恒微电子 WCH", "圣邦微电子 SGMicro", "思瑞浦 3PEAK", "纳芯微 NOVOSENSE"];
  for (const m of cn)
    await t.test(`${m} 通过`, () => assert.equal(applyProfile("domestic", mk(100, "SOIC-8", { mfr: m })).pass, true));
  await t.test("isDomestic 直判", () => {
    assert.equal(isDomestic("Analog Devices"), false);
    assert.equal(isDomestic("GigaDevice Semiconductor"), true);
  });
});

test("低成本：只认真实分销商报价", async t => {
  await t.test("真实分销商报价 + 有货 → 通过", () =>
    assert.equal(applyProfile("lowCost", mk(100, "SOIC-8",
      { market: { priceUSD100: 0.2, source: "distributor_api", stock: "有货", stockQty: 500 } })).downgrade, undefined));
  await t.test("AI 估价 → 降级为待核验，不参与成本排名", () => {
    const r = applyProfile("lowCost", mk(100, "SOIC-8", { market: { priceUSD100: 0.2, source: "ai_estimate" } }));
    assert.equal(r.pass, true); assert.equal(r.downgrade, "NEEDS_VERIFICATION");
    assert.match(r.reason, /AI 估价|无真实/);
  });
  await t.test("无价格数据 → 降级", () => {
    const r = applyProfile("lowCost", mk(100, "SOIC-8"));
    assert.equal(r.downgrade, "NEEDS_VERIFICATION");
  });
  await t.test("inStockOnly 且无现货 → 降级", () => {
    const ctx = mk(100, "SOIC-8", { market: { priceUSD100: 0.2, source: "distributor_api", stock: "缺货", stockQty: 0 } });
    ctx.procurement = { inStockOnly: true };
    const r = applyProfile("lowCost", ctx);
    assert.equal(r.downgrade, "NEEDS_VERIFICATION");
    assert.match(r.reason, /现货/);
  });
  await t.test("inStockOnly=false 时缺货仍可参与", () => {
    const ctx = mk(100, "SOIC-8", { market: { priceUSD100: 0.2, source: "distributor_api", stock: "缺货", stockQty: 0 } });
    ctx.procurement = { inStockOnly: false };
    assert.equal(applyProfile("lowCost", ctx).downgrade, undefined);
  });
});

test("证据覆盖率下限", async t => {
  await t.test("pin2pin 覆盖率不足 → 降级", () => {
    const r = applyProfile("pin2pin", mk(100, "SOIC-8", { cov: 30 }));
    assert.equal(r.downgrade, "NEEDS_VERIFICATION");
  });
  await t.test("funcCompat 覆盖率足够 → 通过", () =>
    assert.equal(applyProfile("funcCompat", mk(100, "SOIC-8", { cov: 50 })).downgrade, undefined));
});

test("权重加成", async t => {
  const params = [{ id: "pkg", name: "封装" }, { id: "gbw", name: "增益带宽积" }, { id: "price", name: "参考价格" }];
  await t.test("pin2pin 提升封装权重", () => {
    const w = weightsFor("pin2pin", params, ["pkg", "gbw", "price"]);
    assert.ok(w.pkg > w.gbw);
  });
  await t.test("lowCost 提升价格权重", () => {
    const w = weightsFor("lowCost", params, ["pkg", "gbw", "price"]);
    assert.ok(w.price > w.gbw);
  });
  await t.test("未知模式不报错", () => assert.ok(weightsFor("nope", params, ["pkg"])));
});

test("五种模式均有 note 说明", async t => {
  for (const [k, p] of Object.entries(PROFILES))
    await t.test(`${k} 有 label 与 note`, () => { assert.ok(p.label); assert.ok(p.note); });
});
