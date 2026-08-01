const test = require("node:test");
const assert = require("node:assert/strict");

function mockRes() {
  const r = { code: 0, body: null };
  r.setHeader = () => {}; r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; }; r.end = () => r;
  return r;
}

/** 用 mock 替换上游后重新加载 pipeline 与 analyze */
function loadAnalyze({ ezplmHit = null, distHit = null, aiData = null }) {
  for (const m of ["../api/_lib/pipeline", "../api/v2/analyze"])
    delete require.cache[require.resolve(m)];
  const ez = require("../api/_lib/ezplm");
  ez.queryLocalDB = async () => ezplmHit;
  ez.searchParts = async () => (ezplmHit ? [ezplmHit] : []);
  ez.queryLocalDBBatch = async () => ({});
  const dist = require("../api/_lib/distributor");
  dist.getDistributorPart = async () => distHit;
  const g = require("../api/_lib/gemini");
  g.analyzeComponent = async pn => aiData || { partNumber: pn, parameters: [] };
  return require("../api/v2/analyze");
}

test("P0：虚构型号不得进入工作台", async t => {
  await t.test("NOT_A_REAL_PART_12345 被阻断（AI 自述虚构）", async () => {
    const analyze = loadAnalyze({ aiData: {
      partNumber: "NOT_A_REAL_PART_12345", manufacturer: "N/A - Fictitious Part",
      description: "Fictitious part, no real data",
      parameters: [{ id: "param_1", name: "封装", value: "N/A", unit: "" }] } });
    const res = mockRes();
    await analyze({ method: "POST", body: { partNumber: "NOT_A_REAL_PART_12345" } }, res);
    assert.ok(res.code === 404 || res.code === 422, `实际 ${res.code}`);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.requestId);
  });

  await t.test("参数几乎全 N/A 也被阻断", async () => {
    const analyze = loadAnalyze({ aiData: {
      partNumber: "XYZ99999", manufacturer: "Unknown", description: "generic device",
      parameters: Array.from({ length: 5 }, (_, i) => ({ id: `param_${i}`, name: `p${i}`, value: "N/A" })) } });
    const res = mockRes();
    await analyze({ method: "POST", body: { partNumber: "XYZ99999" } }, res);
    assert.ok(res.code === 404 || res.code === 422);
  });

  await t.test("AI 有数据但无权威来源 → 422 且不进工作台", async () => {
    const analyze = loadAnalyze({ aiData: {
      partNumber: "SOMEPART123", manufacturer: "Acme", description: "an amplifier",
      parameters: [{ id: "param_1", name: "增益", value: "20", unit: "dB" },
                   { id: "param_2", name: "封装", value: "SOIC-8", unit: "" }] } });
    const res = mockRes();
    await analyze({ method: "POST", body: { partNumber: "SOMEPART123" } }, res);
    assert.equal(res.code, 422);
    assert.equal(res.body.error.details.code, "PART_UNVERIFIED");
  });

  await t.test("ezPLM 命中的真实型号正常放行", async () => {
    const analyze = loadAnalyze({ ezplmHit: {
      partNumber: "TPS62160DGKR", manufacturer: "Texas Instruments", category: "DC-DC",
      description: "降压转换器", footprint: "MSOP-8", _source: "ezplm",
      parameters: Array.from({ length: 6 }, (_, i) => ({
        id: `param_${i + 1}`, name: `参数${i}`, value: String(i + 1), unit: "V",
        source: "ezplm", sourceLabel: "ezPLM" })) } });
    const res = mockRes();
    await analyze({ method: "POST", body: { partNumber: "TPS62160DGKR" } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.original.unverified, undefined);
  });

  await t.test("空 partNumber → 400", async () => {
    const analyze = loadAnalyze({});
    const res = mockRes();
    await analyze({ method: "POST", body: {} }, res);
    assert.equal(res.code, 400);
  });
});
