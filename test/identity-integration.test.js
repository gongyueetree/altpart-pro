const test = require("node:test");
const assert = require("node:assert/strict");

/** 用假的 callEzplm 驱动真实的 ezplm.js 逻辑 */
function loadEzplm(upstreamData) {
  delete require.cache[require.resolve("../api/_lib/ezplm")];
  delete require.cache[require.resolve("../api/ezplm")];
  require("../api/_lib/cache").cache.clear();
  process.env.EZPLM_API_KEY = "test-key";
  const proxy = require("../api/ezplm");
  proxy.callEzplm = async () => ({ ok: true, configured: true, data: upstreamData });
  return require("../api/_lib/ezplm");
}
const P = (mpn, mfr, extra = {}) => ({
  id: `id-${mpn}`, mpn, manufacturer: { name: mfr },
  category: { name: "运算放大器" }, description: "双运放",
  footprint: { name: extra.pkg || "SOIC-8_3.9x4.9mm_P1.27mm",
    kicadModFile: { url: "https://qn.ezplm.com/fp.kicad_mod", fname: "SOIC-8.kicad_mod" } },
  pdf: { url: extra.pdfUrl || "https://qn.ezplm.com/x.pdf", fname: extra.pdf || `${mpn}.pdf` },
  attributes: [{ name: "通道数", value: "2" }, { name: "供电电压", value: "3 to 32" }],
});

test("P0：exact MPN 不得被静默替换", async t => {
  await t.test("TL431 无 exact → 不改名，但必须给出变体供确认（不得丢数据）", async () => {
    const ez = loadEzplm([P("TL431-1", "Texas Instruments"), P("TL431ACDR", "Texas Instruments")]);
    const r = await ez.queryLocalDB("TL431");
    assert.ok(r, "不得返回 null —— 那会导致 ezPLM 数据整体丢失");
    assert.equal(r.needsVariantConfirm, true);
    assert.notEqual(r._matchType, "exact");
    assert.equal(r.requestedMpn, "TL431", "必须保留用户原始输入");
    assert.ok(r.variants.length >= 2, "应列出同族变体");
  });
  await t.test("exactOnly 模式仍可要求严格匹配", async () => {
    const ez = loadEzplm([P("TL431-1", "TI"), P("TL431ACDR", "TI")]);
    assert.equal(await ez.queryLocalDB("TL431", { exactOnly: true }), null);
  });
  await t.test("AD8331 基础型号 → 找出 ARQZ 等变体并带参数", async () => {
    const ez = loadEzplm([P("AD8331ARQZ", "Analog Devices", { pkg: "QSOP-20" }),
                          P("AD8331ARQ-REEL7", "Analog Devices", { pkg: "QSOP-20" })]);
    const r = await ez.queryLocalDB("AD8331");
    assert.ok(r, "基础型号查询不得返回 null");
    assert.ok(r.parameters.length > 0, "必须带出 ezPLM 参数，而非降级到分销商");
    assert.equal(r.needsVariantConfirm, true);
    assert.equal(r._matchType, "package_variant");
    assert.ok(r.variants.some(v => v.pn === "AD8331ARQZ"));
  });
  await t.test("LM358ADR 精确命中", async () => {
    const ez = loadEzplm([P("LM358ADR", "Texas Instruments"), P("LM358AD", "Texas Instruments")]);
    const r = await ez.queryLocalDB("LM358ADR");
    assert.equal(r.partNumber, "LM358ADR");
    assert.equal(r.identity.matchType, "exact");
  });
  await t.test("STM32F103C8T6 不被 ...TR 顶替", async () => {
    const ez = loadEzplm([P("STM32F103C8T6TR", "ST"), P("STM32F103C8T6", "ST"), P("STM32F103C8T7", "ST")]);
    const r = await ez.queryLocalDB("STM32F103C8T6");
    assert.equal(r.partNumber, "STM32F103C8T6");
  });
});

test("P0：LM358ADR 资源身份一致性", async t => {
  await t.test("异厂/异器件 datasheet 被守卫拦截", async () => {
    const ez = loadEzplm([P("LM358ADR", "Texas Instruments", { pdf: "LM2904BAIPWR.pdf" })]);
    const d = await ez.queryPartDetail("LM358ADR");
    const ds = (d.downloads || []).find(x => x.type === "datasheet");
    assert.equal(ds, undefined, "LM2904 的 datasheet 不得出现在 LM358ADR 详情");
    assert.ok((d.blockedResources || []).some(x => x.code === "RESOURCE_IDENTITY_MISMATCH"));
  });
  await t.test("LM258DT.pdf 同样被拦", async () => {
    const ez = loadEzplm([P("LM358ADR", "Texas Instruments", { pdf: "LM258DT.pdf" })]);
    const d = await ez.queryPartDetail("LM358ADR");
    assert.equal((d.downloads || []).find(x => x.type === "datasheet"), undefined);
  });
  await t.test("同器件 datasheet 正常通过", async () => {
    const ez = loadEzplm([P("LM358ADR", "Texas Instruments", { pdf: "lm358a.pdf" })]);
    const d = await ez.queryPartDetail("LM358ADR");
    assert.ok((d.downloads || []).some(x => x.type === "datasheet"));
  });
  await t.test("详情带 identity 且厂商唯一", async () => {
    const ez = loadEzplm([P("LM358ADR", "Texas Instruments", { pdf: "lm358.pdf" })]);
    const d = await ez.queryPartDetail("LM358ADR");
    assert.equal(d.identity.exactMpn, "LM358ADR");
    assert.equal(d.manufacturer, "Texas Instruments");
  });
});

test("缓存键含身份，跨厂商不串", async t => {
  const { identityCacheKey } = require("../api/_lib/part-identity");
  const ti = identityCacheKey("ez:part", { exactMpn: "LM358ADR", manufacturerName: "Texas Instruments", packageCode: "SOIC-8" });
  const st = identityCacheKey("ez:part", { exactMpn: "LM358ADR", manufacturerName: "STMicroelectronics", packageCode: "SOIC-8" });
  await t.test("TI 与 ST 键不同", () => assert.notEqual(ti, st));
});
