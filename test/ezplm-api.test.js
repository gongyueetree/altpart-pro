const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalQuery, buildSignature, callEzplmPaged } = require("../api/ezplm");

test("签名串符合手册规范", async t => {
  await t.test("query 按字典序且过滤空值", () =>
    assert.equal(canonicalQuery({ pageSize: 10, keyword: "RP2350B", empty: "", nul: null }),
      "keyword=RP2350B&pageSize=10"));
  await t.test("cursor 参与签名", () =>
    assert.equal(canonicalQuery({ pageSize: 10, keyword: "X", cursor: "abc" }),
      "cursor=abc&keyword=X&pageSize=10"));
  await t.test("值做 URL 编码", () =>
    assert.match(canonicalQuery({ keyword: "TL431 A/B" }), /TL431%20A%2FB/));
  await t.test("签名可复现", () => {
    const a = buildSignature({ apiKey: "k", method: "GET", path: "/api/v1/api-key/parts",
      params: { keyword: "X" }, timestamp: "1700000000", nonce: "n" });
    const b = buildSignature({ apiKey: "k", method: "GET", path: "/api/v1/api-key/parts",
      params: { keyword: "X" }, timestamp: "1700000000", nonce: "n" });
    assert.equal(a, b);
  });
  await t.test("nonce 不同则签名不同（防重放）", () => {
    const a = buildSignature({ apiKey: "k", method: "GET", path: "/p", params: {}, timestamp: "1", nonce: "n1" });
    const b = buildSignature({ apiKey: "k", method: "GET", path: "/p", params: {}, timestamp: "1", nonce: "n2" });
    assert.notEqual(a, b);
  });
  await t.test("时间戳不同则签名不同", () => {
    const a = buildSignature({ apiKey: "k", method: "GET", path: "/p", params: {}, timestamp: "1", nonce: "n" });
    const b = buildSignature({ apiKey: "k", method: "GET", path: "/p", params: {}, timestamp: "2", nonce: "n" });
    assert.notEqual(a, b);
  });
  await t.test("Key 不同则签名不同", () => {
    const a = buildSignature({ apiKey: "k1", method: "GET", path: "/p", params: {}, timestamp: "1", nonce: "n" });
    const b = buildSignature({ apiKey: "k2", method: "GET", path: "/p", params: {}, timestamp: "1", nonce: "n" });
    assert.notEqual(a, b);
  });
});

test("cursor 分页（手册 data + meta 结构）", async t => {
  const mk = pages => {
    const calls = [];
    const fetcher = async (path, params) => {
      calls.push(params.cursor || null);
      const i = params.cursor ? pages.findIndex(p => p.cursorIn === params.cursor) : 0;
      const p = pages[i];
      return { ok: true, data: p.data, meta: { nextCursor: p.nextCursor, hasMore: p.hasMore },
        nextCursor: p.nextCursor, hasMore: p.hasMore };
    };
    return { fetcher, calls };
  };
  const pages = [
    { cursorIn: null, data: [{ mpn: "A" }, { mpn: "B" }], nextCursor: "c1", hasMore: true },
    { cursorIn: "c1", data: [{ mpn: "C" }, { mpn: "D" }], nextCursor: "c2", hasMore: true },
    { cursorIn: "c2", data: [{ mpn: "E" }], nextCursor: null, hasMore: false },
  ];

  await t.test("自动翻完所有页", async () => {
    const { fetcher, calls } = mk(pages);
    const r = await callEzplmPaged("parts", { keyword: "X" }, 5, fetcher);
    assert.equal(r.data.length, 5);
    assert.equal(r.pages, 3);
    assert.deepEqual(calls, [null, "c1", "c2"]);
    assert.equal(r.truncated, false);
  });

  await t.test("maxPages 限制生效并标记 truncated", async () => {
    const { fetcher } = mk(pages);
    const r = await callEzplmPaged("parts", { keyword: "X" }, 2, fetcher);
    assert.equal(r.pages, 2);
    assert.equal(r.data.length, 4);
    assert.equal(r.truncated, true);
  });

  await t.test("hasMore=false 时立即停止", async () => {
    const single = [{ cursorIn: null, data: [{ mpn: "A" }], nextCursor: null, hasMore: false }];
    const { fetcher, calls } = mk(single);
    const r = await callEzplmPaged("parts", { keyword: "X" }, 5, fetcher);
    assert.equal(calls.length, 1);
    assert.equal(r.pages, 1);
  });

  await t.test("上游失败时返回已取到的数据", async () => {
    let n = 0;
    const fetcher = async () => {
      n++;
      if (n === 1) return { ok: true, data: [{ mpn: "A" }], meta: { nextCursor: "c1", hasMore: true }, nextCursor: "c1", hasMore: true };
      return { ok: false, kind: "upstream_status", status: 502, data: [] };
    };
    const r = await callEzplmPaged("parts", { keyword: "X" }, 5, fetcher);
    assert.equal(r.ok, false);
    assert.equal(r.data.length, 1, "已取到的数据不丢");
  });
});
