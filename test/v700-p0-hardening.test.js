const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeProcurement, procurementCacheKey } = require("../api/_lib/procurement");
const {
  priceAtQuantity, manufacturerMatches, marketCacheKey, buildManufacturerHints,
} = require("../api/_lib/market");
const { comparePackage } = require("../api/_lib/comparison-semantics");
const { comparePinMaps } = require("../api/_lib/pin-compare");
const { isPrivateIp, validateRemoteUrl, fetchWithSafeRedirects } = require("../api/_lib/safe-fetch");
const { calculateScore } = require("../api/_lib/scoring-node");

function mockRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.send = b => { r.body = typeof b === "string" ? JSON.parse(b) : b; return r; };
  r.end = () => r;
  return r;
}

test("v7.0 采购条件契约", async t => {
  await t.test("默认值稳定", () => assert.deepEqual(normalizeProcurement(), {
    region: "US", currency: "USD", packaging: "any", quantity: 100, inStockOnly: false,
  }));
  await t.test("非法数量/地区/包装被拒绝", () => {
    assert.throws(() => normalizeProcurement({ quantity: 0 }), /采购数量/);
    assert.throws(() => normalizeProcurement({ region: "JP" }), /采购地区/);
    assert.throws(() => normalizeProcurement({ packaging: "wafer" }), /包装方式/);
  });
  await t.test("缓存键包含全部采购条件", () => {
    assert.notEqual(procurementCacheKey({ quantity: 10 }), procurementCacheKey({ quantity: 100 }));
    assert.notEqual(procurementCacheKey({ region: "US" }), procurementCacheKey({ region: "CN" }));
  });
});

test("v7.0 价格阶梯按采购数量向下取最大门槛", async t => {
  const tiers = [{ qty: 1, price: 1 }, { qty: 10, price: 0.8 }, { qty: 100, price: 0.5 }];
  await t.test("50 件取 10+ 阶梯，而非错误地取 100+", () => assert.equal(priceAtQuantity(tiers, 50), 0.8));
  await t.test("100 件取 100+", () => assert.equal(priceAtQuantity(tiers, 100), 0.5));
  await t.test("低于 MOQ 不生成虚假报价", () => assert.equal(priceAtQuantity(tiers, 5, 10), null));
});

test("v7.0 行情按 MPN + 厂商隔离", async t => {
  await t.test("厂商别名可以匹配，但不同厂商拒绝", () => {
    assert.equal(manufacturerMatches("Texas Instruments", "TI"), true);
    assert.equal(manufacturerMatches("STMicroelectronics", "TI"), false);
  });
  await t.test("同 MPN 不同厂商使用不同缓存键", () => {
    const procKey = procurementCacheKey({ quantity: 100 });
    assert.notEqual(marketCacheKey("LM358", procKey, "TI"), marketCacheKey("LM358", procKey, "ST"));
  });
  await t.test("一批候选中同 MPN 厂商冲突时不武断选择", () => {
    const hints = buildManufacturerHints([
      { partNumber: "LM358", manufacturer: "TI" },
      { partNumber: "lm358", manufacturer: "STMicroelectronics" },
    ]);
    assert.equal(hints.LM358, "");
  });
});

test("v7.0 封装几何不能被家族名吞掉", async t => {
  await t.test("完整相同 KLC 名称可判 exact", () => {
    const r = comparePackage("Package_SO:SOIC-8_3.9x4.9mm_P1.27mm", "SOIC-8_3.9x4.9mm_P1.27mm");
    assert.equal(r.exact, true);
  });
  await t.test("同为 SOIC-8 但本体尺寸不同，不得判 exact/compatible", () => {
    const r = comparePackage("SOIC-8_3.9x4.9mm_P1.27mm", "SOIC-8_5.3x6.2mm_P1.27mm");
    assert.equal(r.exact, false); assert.equal(r.compatible, false); assert.match(r.reason, /几何/);
  });
  await t.test("只有家族名时最多判兼容，不能证明 exact", () => {
    const r = comparePackage("SOIC-8_3.9x4.9mm_P1.27mm", "SOIC-8");
    assert.equal(r.compatible, true); assert.equal(r.exact, false);
  });
  await t.test("双方都只写 SOIC-8 也不能证明 land pattern 完全相同", () => {
    const r = comparePackage("SOIC-8", "SOIC-8");
    assert.equal(r.compatible, true); assert.equal(r.exact, false);
  });
});

test("v7.0 逐针映射证据", async t => {
  const original = { _source: "ezplm", pinEvidence: { source: "datasheet", url: "o.pdf" },
    pins: [{ number: 1, name: "OUT", type: "output" }, { number: 2, name: "IN-", type: "input" },
      { number: 3, name: "IN+", type: "input" }] };
  await t.test("权威来源且逐针一致才 verified", () => {
    const candidate = { _source: "ezplm", pinEvidence: { source: "kicad", url: "c.kicad_sym" },
      pins: [{ number: "01", name: "OUT", type: "输出" }, { number: "2", name: "IN-", type: "输入" },
        { number: 3, name: "IN+", type: "input" }] };
    const r = comparePinMaps(original, candidate);
    assert.equal(r.status, "verified"); assert.equal(r.verified, true); assert.equal(r.coverage, 100);
  });
  await t.test("同一脚功能不同是 conflict", () => {
    const candidate = { pinEvidence: { source: "datasheet" },
      pins: [{ number: 1, name: "VCC", type: "power_in" }, { number: 2, name: "IN-", type: "input" },
        { number: 3, name: "IN+", type: "input" }] };
    const r = comparePinMaps(original, candidate);
    assert.equal(r.status, "conflict"); assert.equal(r.verified, false); assert.equal(r.conflicts[0].number, "1");
  });
  await t.test("功能名相同但电气方向不同是 conflict", () => {
    const candidate = { pinEvidence: { source: "datasheet" }, pins: original.pins.map(p => ({ ...p })) };
    candidate.pins[0].type = "input";
    const r = comparePinMaps(original, candidate);
    assert.equal(r.status, "conflict"); assert.match(r.conflicts[0].reason, /电气类型|方向/);
  });
  await t.test("缺少电气类型只能待核验", () => {
    const candidate = { pinEvidence: { source: "datasheet" },
      pins: original.pins.map(({ number, name }) => ({ number, name })) };
    const r = comparePinMaps(original, candidate);
    assert.equal(r.status, "insufficient"); assert.match(r.reason, /电气类型|方向/);
  });
  await t.test("AI PinMap 不能作为直接替代证据", () => {
    const candidate = { pinEvidence: { source: "ai_pinout" }, pins: original.pins };
    assert.equal(comparePinMaps(original, candidate).status, "insufficient");
  });
});

test("v7.0 RuleProfile 权重进入真实评分", () => {
  const params = [
    { id: "a", name: "带宽", value: "10", unit: "MHz", source: "ezplm" },
    { id: "b", name: "静态电流", value: "1", unit: "mA", source: "ezplm" },
  ];
  const candidate = { _source: "ezplm", parameters: {
    a: { value: "10 MHz", source: "ezplm" }, b: { value: "10 mA", source: "ezplm" },
  }};
  const bandwidthFirst = calculateScore(params, candidate, ["a", "b"], {}, { weights: { a: 10, b: 1 } });
  const currentFirst = calculateScore(params, candidate, ["a", "b"], {}, { weights: { a: 1, b: 10 } });
  assert.ok(bandwidthFirst.technical > currentFirst.technical,
    `${bandwidthFirst.technical} 应高于 ${currentFirst.technical}`);
});

test("v7.0 分析上下文防篡改", async t => {
  const previous = process.env.ANALYSIS_CONTEXT_SECRET;
  process.env.ANALYSIS_CONTEXT_SECRET = "test-secret-at-least-32-bytes-123456";
  delete require.cache[require.resolve("../api/_lib/analysis-context")];
  const { signAnalysisContext, verifyAnalysisContext } = require("../api/_lib/analysis-context");
  const original = { partNumber: "LM358ADR", manufacturer: "TI", _source: "ezplm",
    parameters: [{ id: "p1", name: "封装", value: "SOIC-8", source: "ezplm" }] };
  const token = signAnalysisContext(original, original.partNumber);
  await t.test("原 token 可验证", () => assert.equal(verifyAnalysisContext(token, "LM358ADR").valid, true));
  await t.test("篡改 payload 后签名失效", () => {
    const [body, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    payload.original.parameters[0].value = "QFN-8";
    const changed = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    assert.equal(verifyAnalysisContext(changed, "LM358ADR").code, "bad_signature");
  });
  await t.test("不能挪给另一型号使用", () => assert.equal(verifyAnalysisContext(token, "TL072").code, "part_mismatch"));
  if (previous === undefined) delete process.env.ANALYSIS_CONTEXT_SECRET;
  else process.env.ANALYSIS_CONTEXT_SECRET = previous;
  delete require.cache[require.resolve("../api/_lib/analysis-context")];
});

test("v7.0 SSRF 防护", async t => {
  await t.test("识别 IPv4/IPv6 私网与 metadata", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "198.51.100.2",
      "::1", "[::1]", "fc00::1", "::ffff:7f00:1", "2001:db8::1"])
      assert.equal(isPrivateIp(ip), true, ip);
    await assert.rejects(validateRemoteUrl("http://127.0.0.1/a.pdf"), /私网|保留/);
    await assert.rejects(validateRemoteUrl("http://metadata.google.internal/a"), /元数据/);
  });
  await t.test("每次重定向都重新执行主机白名单", async () => {
    let calls = 0;
    const response = { status: 302, headers: { get: name => name === "location" ? "https://evil.example/a" : null } };
    await assert.rejects(fetchWithSafeRedirects("https://files.ezplm.cn/a", {
      allowedHost: host => host.endsWith("ezplm.cn"), resolveDns: false,
      fetchImpl: async () => { calls++; return response; },
    }), /不允许的主机/);
    assert.equal(calls, 1);
  });
});

test("v7.0 生命周期无证据时 fail-closed", () => {
  const { unknownLifecycle } = require("../api/lifecycle/[pn].js");
  const r = unknownLifecycle("LM317");
  assert.equal(r.lifecycle, "unknown");
  assert.equal(r.compliance.rohs, null);
  assert.equal(r.compliance.reach, null);
  assert.equal(r._source, "unavailable");
});

test("v7.0 recommend 实际接收并传递采购条件", async () => {
  let captured;
  const pipeline = require("../api/_lib/pipeline");
  const market = require("../api/_lib/market");
  const oldRun = pipeline.runPipeline, oldMarket = market.getMarketInfo;
  pipeline.runPipeline = async args => {
    captured = args;
    return { original: { partNumber: args.partNumber }, recommendations: [{
      partNumber: "LMV358", manufacturer: "TI", authoritative: true,
      replacementLevel: { level: "COMPATIBLE_WITH_REVIEW" }, overallScore: 80,
    }], pendingVerification: [], eliminated: [], pipeline: {} };
  };
  market.getMarketInfo = async () => ({ parts: {} });
  delete require.cache[require.resolve("../api/v2/recommend")];
  const handler = require("../api/v2/recommend");
  const res = mockRes();
  await handler({ method: "POST", body: { partNumber: "LM358ADR", mode: "lowCost",
    procurement: { region: "CN", currency: "CNY", packaging: "tape", quantity: 250, inStockOnly: true } } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(captured.procurement, { region: "CN", currency: "CNY", packaging: "tape", quantity: 250, inStockOnly: true });
  pipeline.runPipeline = oldRun; market.getMarketInfo = oldMarket;
  delete require.cache[require.resolve("../api/v2/recommend")];
});
