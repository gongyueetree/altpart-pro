const test = require("node:test");
const assert = require("node:assert/strict");

function mockRes() {
  const r = { code: 0, body: null };
  r.setHeader = () => {}; r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; }; r.end = () => r;
  return r;
}
function load({ candidates = [], candParams = null, throwErr = null, authoritative = false } = {}) {
  // pipeline 以解构方式捕获 gemini 的函数引用，必须先设 mock 再重新加载 pipeline，
  // 否则拿到的是上一个用例遗留的引用（这曾让上游异常用例误判为通过）
  // 模块级缓存会跨用例污染：前一用例缓存的候选会让后一用例的 mock 根本不被调用
  require("../api/_lib/cache").cache.clear();
  const ez = require("../api/_lib/ezplm");
  ez.queryLocalDB = async pn => ({
    partNumber: pn, manufacturer: "Analog Devices", category: "VGA",
    description: "可变增益放大器", footprint: "SSOP-20", _source: "ezplm",
    parameters: [
      { id: "p1", name: "封装", nameEn: "Package", value: "SSOP-20", unit: "", source: "ezplm", sourceLabel: "ezPLM" },
      { id: "p2", name: "增益", nameEn: "Gain", value: "48", unit: "dB", source: "ezplm", sourceLabel: "ezPLM" },
      { id: "p3", name: "工作温度", nameEn: "Temp", value: "-40 to 85", unit: "°C", source: "ezplm", sourceLabel: "ezPLM" },
    ] });
  ez.searchParts = async () => []; ez.queryLocalDBBatch = async () => ({});
  const g = require("../api/_lib/gemini");
  g.getCandidates = async () => { if (throwErr) throw throwErr;
    return { candidates: candidates.map(pn => ({ pn, functionCategory: "vga" })), eliminated: [] }; };
  const c = require("../api/_lib/component");
  c.fetchComponentFromAPIs = async pn => ({
    partNumber: pn, manufacturer: "Analog Devices", description: "VGA",
    parameters: candParams || { p1: { value: "QFN-16", source: "ai_search" },
      p2: { value: "48 dB", source: "ai_search" }, p3: { value: "-40 to 85 °C", source: "ai_search" } },
    _source: authoritative ? "ezplm" : "ai_search" });
  const m = require("../api/_lib/market");
  m.getMarketInfo = async pns => ({ parts: Object.fromEntries(pns.map(p => [p, { priceUSD1: 1, source: "ai_estimate" }])) });
  for (const mod of ["../api/_lib/pipeline", "../api/v2/recommend"])
    delete require.cache[require.resolve(mod)];
  return require("../api/v2/recommend");
}

test("P0：五种模式必须给出可解释结果，不得笼统失败", async t => {
  await t.test("Pin-to-Pin 封装不符 → PIN_EVIDENCE_MISSING/NO_VERIFIED_CANDIDATES 而非崩溃", async () => {
    const h = load({ candidates: ["AD8332ARQZ"] });   // 候选封装 QFN-16 ≠ SSOP-20
    const res = mockRes();
    await h({ method: "POST", body: { partNumber: "AD8331ARQ", mode: "pin2pin" } }, res);
    assert.equal(res.body.success, false);
    assert.ok(["PIN_EVIDENCE_MISSING", "NO_VERIFIED_CANDIDATES"].includes(res.body.error.code), res.body.error.code);
    assert.ok(res.body.error.requestId);
    assert.equal(res.body.error.stage, "candidate_validation");
    assert.ok(res.body.error.details.eliminatedCount > 0, "应说明排除了多少候选");
  });

  await t.test("国产替代无国产候选 → NO_VERIFIED_CANDIDATES", async () => {
    const h = load({ candidates: ["AD8332ARQZ"] });
    const res = mockRes();
    await h({ method: "POST", body: { partNumber: "AD8331ARQ", mode: "domestic" } }, res);
    assert.equal(res.body.error.code, "NO_VERIFIED_CANDIDATES");
    assert.match(JSON.stringify(res.body.error.details.eliminated), /境外厂商|非国产/);
  });

  await t.test("功能兼容 + AI候选 → 200，但只进待核验区，不占正式 Top N", async () => {
    const h = load({ candidates: ["AD8332ARQZ"] });   // mock 来源为 ai_search，非权威
    const res = mockRes();
    await h({ method: "POST", body: { partNumber: "AD8331ARQ", mode: "funcCompat" } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.recommendations.length, 0, "AI 候选不得进入正式推荐");
    assert.ok(res.body.pendingVerification.length > 0, "应进入待核验候选");
    assert.equal(res.body.onlyPending, true);
    assert.match(res.body.notice, /待核验/);
    assert.equal(res.body.pendingVerification[0].replacementLevel.level, "NEEDS_VERIFICATION");
    assert.ok(res.body.requestId);
    assert.ok(Array.isArray(res.body.timings), "应返回阶段计时");
  });

  await t.test("功能兼容 + ezPLM权威候选 → 进入正式 Top N", async () => {
    const h = load({ candidates: ["AD8332ARQZ"], authoritative: true });
    const res = mockRes();
    await h({ method: "POST", body: { partNumber: "AD8331ARQ", mode: "funcCompat" } }, res);
    assert.equal(res.code, 200);
    assert.ok(res.body.recommendations.length > 0, "权威候选应进入正式推荐");
    assert.equal(res.body.recommendations[0].authoritative, true);
    assert.ok(!res.body.onlyPending);
  });
});

test("错误码与 HTTP status 映射", async t => {
  await t.test("未知模式 → 400 INVALID_REQUEST", async () => {
    const h = load({}); const res = mockRes();
    await h({ method: "POST", body: { partNumber: "X", mode: "nope" } }, res);
    assert.equal(res.code, 400);
    assert.equal(res.body.error.code, "INVALID_REQUEST");
    assert.ok(res.body.error.details.allowed.includes("pin2pin"));
  });
  await t.test("缺 partNumber → 400", async () => {
    const h = load({}); const res = mockRes();
    await h({ method: "POST", body: {} }, res);
    assert.equal(res.code, 400);
  });
  await t.test("未验证原型号 → 422 PART_UNVERIFIED（不消耗推荐配额）", async () => {
    const h = load({}); const res = mockRes();
    await h({ method: "POST", body: { partNumber: "FAKE1", mode: "funcCompat",
      original: { partNumber: "FAKE1", unverified: true, parameters: [] } } }, res);
    assert.equal(res.code, 422);
    assert.equal(res.body.error.code, "PART_UNVERIFIED");
  });
  await t.test("上游超时 → 504 UPSTREAM_TIMEOUT retryable", async () => {
    const e = new Error("timed out"); e.name = "TimeoutError";
    const h = load({ throwErr: e }); const res = mockRes();
    await h({ method: "POST", body: { partNumber: "AD8331ARQ", mode: "funcCompat" } }, res);
    assert.equal(res.code, 504);
    assert.equal(res.body.error.retryable, true);
  });
  await t.test("AI JSON 无效 → 502 AI_INVALID_RESPONSE", async () => {
    const h = load({ throwErr: new Error("AI 返回 JSON 解析失败") }); const res = mockRes();
    await h({ method: "POST", body: { partNumber: "AD8331ARQ", mode: "funcCompat" } }, res);
    assert.equal(res.body.error.code, "AI_INVALID_RESPONSE");
  });
  await t.test("限流 → 429", async () => {
    const h = load({ throwErr: new Error("Gemini 429 限流") }); const res = mockRes();
    await h({ method: "POST", body: { partNumber: "AD8331ARQ", mode: "funcCompat" } }, res);
    assert.equal(res.code, 429);
    assert.equal(res.body.error.retryable, true);
  });
  await t.test("GET → 405", async () => {
    const h = load({}); const res = mockRes();
    await h({ method: "GET", query: {} }, res);
    assert.equal(res.code, 405);
  });
});

test("不得内部失败却返回 200 + 空数组", async t => {
  const h = load({ candidates: ["AD8332ARQZ"] });
  const res = mockRes();
  await h({ method: "POST", body: { partNumber: "AD8331ARQ", mode: "pin2pin" } }, res);
  await t.test("无候选时 success 必须为 false", () => assert.equal(res.body.success, false));
  await t.test("不得返回空 recommendations 数组伪装成功", () =>
    assert.ok(!(res.body.success === true && (res.body.recommendations || []).length === 0)));
});
