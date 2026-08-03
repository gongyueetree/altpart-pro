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

test("P0：完整型号必须优先精确检索（不得因分页错过）", async t => {
  const P2 = (mpn) => ({ id: `id-${mpn}`, mpn, manufacturer: { name: "Texas Instruments" },
    category: { name: "电压基准" }, description: "可调精密并联稳压器",
    footprint: { name: "SOT-23-5" }, pdf: { url: "https://qn.ezplm.com/x.pdf", fname: "TL431.pdf" },
    attributes: [{ name: "工作温度", value: "0 to 70" }, { name: "输出电流", value: "100 mA" }] });

  await t.test("完整型号查询命中即用（不回退基础型号）", async () => {
    delete require.cache[require.resolve("../api/_lib/ezplm")];
    delete require.cache[require.resolve("../api/ezplm")];
    require("../api/_lib/cache").cache.clear();
    process.env.EZPLM_API_KEY = "test-key";
    const proxy = require("../api/ezplm");
    const calls = [];
    proxy.callEzplm = async (path, params) => {
      calls.push(params.keyword);
      // 完整型号查询直接命中
      if (params.keyword === "TL431ACDBVRG4") return { ok: true, data: [P2("TL431ACDBVRG4")] };
      return { ok: true, data: [] };
    };
    const ez = require("../api/_lib/ezplm");
    const r = await ez.queryLocalDB("TL431ACDBVRG4");
    assert.ok(r, "完整型号在 ezPLM 中存在时不得返回 null");
    assert.equal(r.partNumber, "TL431ACDBVRG4");
    assert.equal(r.identity.matchType, "exact");
    assert.equal(calls[0], "TL431ACDBVRG4", "第一次查询必须用完整型号");
  });

  await t.test("完整型号查不到时回退基础型号找同族", async () => {
    delete require.cache[require.resolve("../api/_lib/ezplm")];
    delete require.cache[require.resolve("../api/ezplm")];
    require("../api/_lib/cache").cache.clear();
    process.env.EZPLM_API_KEY = "test-key";
    const proxy = require("../api/ezplm");
    const calls = [];
    proxy.callEzplm = async (path, params) => {
      calls.push(params.keyword);
      if (params.keyword === "TL431") return { ok: true, data: [P2("TL431ACDBZR"), P2("TL431AIDBZR")] };
      return { ok: true, data: [] };   // 完整型号查不到
    };
    const ez = require("../api/_lib/ezplm");
    const r = await ez.queryLocalDB("TL431ACDBVRG4");
    assert.ok(r, "应回退基础型号并返回同族变体");
    assert.equal(r.needsVariantConfirm, true);
    assert.equal(r.requestedMpn, "TL431ACDBVRG4");
    assert.deepEqual(calls, ["TL431ACDBVRG4", "TL431"], "先完整型号，再基础型号");
    assert.ok(r.variants.length >= 2);
  });

  await t.test("完整型号搜索返回同族但非精确 → 合并基础型号结果", async () => {
    delete require.cache[require.resolve("../api/_lib/ezplm")];
    delete require.cache[require.resolve("../api/ezplm")];
    require("../api/_lib/cache").cache.clear();
    process.env.EZPLM_API_KEY = "test-key";
    const proxy = require("../api/ezplm");
    proxy.callEzplm = async (path, params) => {
      if (params.keyword === "TL431ACDBVRG4") return { ok: true, data: [P2("TL431ACDBVR")] };
      if (params.keyword === "TL431") return { ok: true, data: [P2("TL431ACDBVR"), P2("TL431AIDBZR")] };
      return { ok: true, data: [] };
    };
    const ez = require("../api/_lib/ezplm");
    const r = await ez.queryLocalDB("TL431ACDBVRG4");
    // TL431ACDBVR 与 TL431ACDBVRG4 仅差包装后缀 G4 → 视为 exact
    assert.equal(r.identity.matchType, "exact");
    assert.equal(r.partNumber, "TL431ACDBVR");
  });
});

test("ALT-001：顶层资源字段也必须过身份守卫", async t => {
  const mk = (extra) => {
    delete require.cache[require.resolve("../api/_lib/ezplm")];
    delete require.cache[require.resolve("../api/ezplm")];
    require("../api/_lib/cache").cache.clear();
    process.env.EZPLM_API_KEY = "k";
    const proxy = require("../api/ezplm");
    proxy.callEzplm = async () => ({ ok: true, data: [{
      id: "u1", mpn: "LM358AMNOPB", manufacturer: { name: "Texas Instruments" },
      category: { name: "运算放大器" }, description: "双通道、32V、1MHz 运算放大器",
      footprint: { name: "SOIC-8" },
      pdf: { url: extra.pdfUrl, fname: extra.pdf },
      officialUrl: extra.official,
      attributes: [{ name: "通道数", value: "2" }, { name: "供电电压", value: "3 to 32" }],
    }] });
    return require("../api/_lib/ezplm");
  };

  await t.test("异器件 datasheet 顶层字段被置 null", async () => {
    const ez = mk({ pdf: "LM258DT.pdf", pdfUrl: "https://qn.ezplm.com/lm258.pdf",
                    official: "https://www.ti.com/product/LM358A" });
    const d = await ez.queryPartDetail("LM358AM/NOPB");
    assert.equal(d.datasheetUrl, null, "LM258 的 PDF 不得作为 LM358AM/NOPB 的 datasheet");
    assert.ok(d.blockedResources.some(b => b.type === "datasheet"));
    assert.equal(d.downloads.find(x => x.type === "datasheet"), undefined);
  });

  await t.test("同器件资料正常保留", async () => {
    const ez = mk({ pdf: "lm358a.pdf", pdfUrl: "https://qn.ezplm.com/lm358a.pdf",
                    official: "https://www.ti.com/product/LM358A" });
    const d = await ez.queryPartDetail("LM358AM/NOPB");
    assert.ok(d.datasheetUrl, "同系列 datasheet 应保留");
    assert.ok(d.downloads.some(x => x.type === "datasheet"));
  });

  await t.test("详情厂商与身份一致", async () => {
    const ez = mk({ pdf: "lm358a.pdf", pdfUrl: "https://qn.ezplm.com/x.pdf", official: "" });
    const d = await ez.queryPartDetail("LM358AM/NOPB");
    assert.equal(d.manufacturer, "Texas Instruments");
    assert.equal(d.identity.manufacturerName, "Texas Instruments");
  });
});

test("ALT-002：同厂商同 MPN 去重", async t => {
  const { dedupeVariants } = require("../api/_lib/part-identity");
  await t.test("LM358AD 重复两条 → 合并且标冲突", () => {
    const r = dedupeVariants([
      { partNumber: "LM358AD", manufacturer: "Texas Instruments", description: "双通道、32V、1MHz 运算放大器", footprint: "SOIC-8", parameters: [1,2,3] },
      { partNumber: "LM358AD", manufacturer: "Texas Instruments", description: "低输入偏置电流", footprint: "SOIC-8", parameters: [1] },
    ]);
    assert.equal(r.records.length, 1);
    assert.equal(r.records[0].duplicateConflict, true);
    assert.equal(r.conflicts.length, 1);
  });
  await t.test("不同厂商同 MPN 不合并", () => {
    const r = dedupeVariants([
      { partNumber: "LM358AD", manufacturer: "Texas Instruments", description: "TI" },
      { partNumber: "LM358AD", manufacturer: "STMicroelectronics", description: "ST" },
    ]);
    assert.equal(r.records.length, 2);
  });
  await t.test("大小写/分隔符差异视为同一 MPN", () => {
    const r = dedupeVariants([
      { partNumber: "LM358AM/NOPB", manufacturer: "TI", description: "a", parameters: [1] },
      { partNumber: "lm358amnopb", manufacturer: "Texas Instruments", description: "a" },
    ]);
    assert.equal(r.records.length, 1);
  });
});
