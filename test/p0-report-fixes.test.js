const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateScore } = require("../api/_lib/scoring-node");

function mockRes() {
  const r = { code: 0, body: null };
  r.setHeader = () => {}; r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; }; r.end = () => r;
  return r;
}
function loadRecommend({ candFlash = "N/A" } = {}) {
  require("../api/_lib/cache").cache.clear();
  const ez = require("../api/_lib/ezplm");
  ez.queryLocalDB = async pn => ({
    partNumber: pn, manufacturer: "STMicroelectronics", category: "微控制器",
    description: "Cortex-M3 MCU", footprint: "LQFP-48", _source: "ezplm",
    parameters: [
      { id: "flash", name: "Flash", nameEn: "Flash", value: "64", unit: "KB", source: "ezplm", sourceLabel: "ezPLM" },
      { id: "core", name: "内核", nameEn: "Core", value: "ARM Cortex-M3", unit: "", source: "ezplm", sourceLabel: "ezPLM" },
      { id: "pkg", name: "封装", nameEn: "Package", value: "LQFP-48", unit: "", source: "ezplm", sourceLabel: "ezPLM" },
    ] });
  ez.searchParts = async () => [];
  ez.queryLocalDBBatch = async () => ({});
  const g = require("../api/_lib/gemini");
  g.getCandidates = async () => ({ candidates: [{ pn: "STM32F103CBT6", functionCategory: "mcu" }], eliminated: [] });
  const c = require("../api/_lib/component");
  c.fetchComponentFromAPIs = async pn => ({
    partNumber: pn, manufacturer: "STMicroelectronics",
    description: "128 KB Flash 的 Cortex-M3 MCU",   // 描述称有 128KB，但结构化字段缺失
    parameters: { flash: { value: candFlash, source: candFlash === "N/A" ? "" : "ezplm" },
      core: { value: "ARM Cortex-M3", source: "ezplm" }, pkg: { value: "LQFP-48", source: "ezplm" } },
    _source: "ezplm" });
  const m = require("../api/_lib/market");
  m.getMarketInfo = async pns => ({ parts: Object.fromEntries(pns.map(p => [p, { priceUSD1: 1, source: "ai_estimate" }])) });
  for (const mod of ["../api/_lib/pipeline", "../api/v2/recommend"]) delete require.cache[require.resolve(mod)];
  return require("../api/v2/recommend");
}

test("ALT-003：硬约束字段为 N/A 时 fail-closed", async t => {
  await t.test("评分层标记 needsVerification", () => {
    const params = [{ id: "flash", name: "Flash", nameEn: "Flash", value: "64", unit: "KB" }];
    const r = calculateScore(params, { _source: "ezplm", parameters: { flash: { value: "N/A" } } },
      ["flash"], { flash: { constraintType: "hard", min: "64" } });
    assert.equal(r.needsVerification, true);
    assert.equal(r.replacementLevel.level, "NEEDS_VERIFICATION");
  });

  await t.test("候选不得进入正式 Top N（AI 描述称 128KB 也不行）", async () => {
    const h = loadRecommend({ candFlash: "N/A" });
    const res = mockRes();
    await h({ method: "POST", body: { partNumber: "STM32F103C8T6TR", mode: "funcCompat",
      constraints: { flash: { constraintType: "hard", min: "64" } } } }, res);
    const recs = res.body?.recommendations || [];
    assert.equal(recs.length, 0, "硬约束未知的候选不得进入正式推荐");
    const pend = res.body?.pendingVerification || [];
    assert.ok(pend.length > 0, "应进入待核验候选");
    assert.match(pend[0].pendingReason, /硬约束|无法验证/);
  });

  await t.test("补齐结构化值后可进入正式推荐", async () => {
    const h = loadRecommend({ candFlash: "128 KB" });
    const res = mockRes();
    await h({ method: "POST", body: { partNumber: "STM32F103C8T6TR", mode: "funcCompat",
      constraints: { flash: { constraintType: "hard", min: "64" } } } }, res);
    assert.ok((res.body?.recommendations || []).length > 0, "值可信后应正常推荐");
  });
});
