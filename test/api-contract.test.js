const test = require("node:test");
const assert = require("node:assert/strict");
const { fail, ok, classifyUpstream } = require("../api/_lib/http");

function mockRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

test("统一错误响应格式", async t => {
  await t.test("400 结构完整", () => {
    const res = mockRes(); fail(res, "BAD_REQUEST", "参数错误");
    assert.equal(res.code, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "BAD_REQUEST");
    assert.ok(res.body.error.requestId);
  });
  const map = { UNAUTHORIZED: 401, FORBIDDEN: 403, RATE_LIMITED: 429,
                INTERNAL: 500, UPSTREAM_ERROR: 502, UPSTREAM_TIMEOUT: 504 };
  for (const [code, status] of Object.entries(map))
    await t.test(`${code} → HTTP ${status}`, () => {
      const res = mockRes(); fail(res, code, "x"); assert.equal(res.code, status);
    });
  await t.test("成功响应带 success:true", () => {
    const res = mockRes(); ok(res, { parts: {} });
    assert.equal(res.code, 200); assert.equal(res.body.success, true);
  });
});

test("上游异常分类", async t => {
  await t.test("超时 → UPSTREAM_TIMEOUT", () =>
    assert.equal(classifyUpstream({ name: "TimeoutError", message: "timed out" }), "UPSTREAM_TIMEOUT"));
  await t.test("限流 → RATE_LIMITED", () =>
    assert.equal(classifyUpstream(new Error("Gemini 429 限流")), "RATE_LIMITED"));
  await t.test("上游5xx → UPSTREAM_ERROR", () =>
    assert.equal(classifyUpstream(new Error("upstream 503")), "UPSTREAM_ERROR"));
  await t.test("未知 → INTERNAL", () =>
    assert.equal(classifyUpstream(new Error("something odd")), "INTERNAL"));
});

test("/api/v2/market 批量上限契约", async t => {
  const handler = require("../api/v2/market.js");
  await t.test("超过 8 个返回 400 而非静默截断", async () => {
    const res = mockRes();
    await handler({ method: "POST", body: { partNumbers: Array.from({ length: 10 }, (_, i) => `PN${i}`) } }, res);
    assert.equal(res.code, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.details.received, 10);
  });
  await t.test("空数组返回 400", async () => {
    const res = mockRes();
    await handler({ method: "POST", body: { partNumbers: [] } }, res);
    assert.equal(res.code, 400);
  });
  await t.test("非数组返回 400", async () => {
    const res = mockRes();
    await handler({ method: "POST", body: { partNumbers: "PN1" } }, res);
    assert.equal(res.code, 400);
  });
  await t.test("GET 方法不被允许", async () => {
    const res = mockRes();
    await handler({ method: "GET", query: {} }, res);
    assert.equal(res.code, 405);
  });
});
