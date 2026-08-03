const test = require("node:test");
const assert = require("node:assert/strict");

function mockRes() {
  const r = { code: 0, body: null };
  r.setHeader = () => {}; r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; }; r.end = () => r;
  return r;
}
function load({ candidates, candValue, constraints } = {}) {
  require("../api/_lib/cache").cache.clear();
  const ez = require("../api/_lib/ezplm");
  ez.queryLocalDB = async pn => ({
    partNumber: pn, manufacturer: "Texas Instruments", category: "电压基准",
    description: "可调精密并联稳压器", footprint: "SOT-23-5", _source: "ezplm",
    parameters: [
      { id: "t", name: "工作温度", nameEn: "Operating Temperature", value: "-40 to 85", unit: "°C", source: "ezplm", sourceLabel: "ezPLM" },
      { id: "i", name: "输出电流", nameEn: "Output Current", value: "100", unit: "mA", source: "ezplm", sourceLabel: "ezPLM" },
      { id: "p", name: "封装", nameEn: "Package", value: "SOT-23-5", unit: "", source: "ezplm", sourceLabel: "ezPLM" },
    ] });
  ez.searchParts = async () => [];
  ez.queryLocalDBBatch = async () => ({});
  const g = require("../api/_lib/gemini");
  g.getCandidates = async () => ({ candidates: (candidates || ["TL432AIDBZR"]).map(pn => ({ pn, functionCategory: "voltage-reference" })), eliminated: [] });
  const c = require("../api/_lib/component");
  c.fetchComponentFromAPIs = async pn => ({
    partNumber: pn, manufacturer: "Texas Instruments", description: "可调精密并联稳压器",
    parameters: { t: { value: candValue ?? "-40 to 85 °C", source: "ezplm" },
      i: { value: "100 mA", source: "ezplm" }, p: { value: "SOT-23-5", source: "ezplm" } },
    _source: "ezplm" });
  const m = require("../api/_lib/market");
  m.getMarketInfo = async pns => ({ parts: Object.fromEntries(pns.map(p => [p, { priceUSD1: 1, source: "ai_estimate" }])) });
  for (const mod of ["../api/_lib/pipeline", "../api/v2/recommend"]) delete require.cache[require.resolve(mod)];
  return require("../api/v2/recommend");
}

test("硬约束违规必须被明确淘汰并给出原因", async t => {
  await t.test("温度不覆盖 → 进入 eliminated 且原因可读", async () => {
    const h = load({ candValue: "0 to 70 °C" });
    const res = mockRes();
    await h({ method: "POST", body: { partNumber: "TL431ACDBVR", mode: "funcCompat",
      constraints: { t: { constraintType: "hard", min: "-40", max: "85" } } } }, res);
    const elim = res.body?.error?.details?.eliminated || res.body?.eliminated || [];
    assert.ok(elim.length > 0, "硬约束违规候选必须出现在淘汰列表");
    const hit = elim.find(e => e.partNumber === "TL432AIDBZR");
    assert.ok(hit, "被淘汰的型号应可识别");
    assert.ok(hit.reason && hit.reason !== "undefined", `原因不得为空，实际: ${hit.reason}`);
    assert.equal(hit.stage, "hard_constraint", "应标记淘汰阶段");
  });

  await t.test("满足硬约束时正常推荐", async () => {
    const h = load({ candValue: "-40 to 125 °C" });
    const res = mockRes();
    await h({ method: "POST", body: { partNumber: "TL431ACDBVR", mode: "funcCompat",
      constraints: { t: { constraintType: "hard", min: "-40", max: "85" } } } }, res);
    assert.ok((res.body?.recommendations || []).length > 0);
  });
});

test("无候选时必须返回可诊断的淘汰明细", async t => {
  const h = load({ candValue: "0 to 70 °C" });
  const res = mockRes();
  await h({ method: "POST", body: { partNumber: "TL431ACDBVR", mode: "funcCompat",
    constraints: { t: { constraintType: "hard", min: "-40", max: "85" } } } }, res);
  await t.test("业务码为 NO_VERIFIED_CANDIDATES", () =>
    assert.equal(res.body.error.code, "NO_VERIFIED_CANDIDATES"));
  await t.test("details 带 eliminatedCount", () =>
    assert.ok(res.body.error.details.eliminatedCount > 0));
  await t.test("details 带完整淘汰列表", () =>
    assert.ok(Array.isArray(res.body.error.details.eliminated) && res.body.error.details.eliminated.length > 0));
  await t.test("每条淘汰项都有原因", () =>
    assert.ok(res.body.error.details.eliminated.every(e => e.reason)));
  await t.test("requestId 可用于排查", () => assert.ok(res.body.error.requestId));
});
