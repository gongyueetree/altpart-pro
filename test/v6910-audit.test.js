// v6.9.10 自审修复回归
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("FIX-1/2：共享装配器与空值防护", async t => {
  const s = R("api/_lib/pipeline.js");
  await t.test("主/救回循环共用 buildScoredEntry，手写字面量清零", () => {
    assert.match(s, /const buildScoredEntry = \(cand, result, extra = \{\}\)/);
    assert.equal((s.match(/buildScoredEntry\(cand, result/g) || []).length, 2);
    assert.doesNotMatch(s, /cand\.manufacturer\.toLowerCase\(\)/);   // 无保护链已清零
  });
  await t.test("救回条目补齐 market/extraParams，dataSource 认 digikey/mouser", () => {
    assert.match(s, /market: cand\.market \|\| null,\s+extraParams: cand\.extraParams \|\| \[\]/);
    assert.match(s, /\/\^digikey\/\.test\(cand\._source\|\|""\) \? "DigiKey" : \/\^mouser\//);
    assert.match(s, /\{ _lowConfidence: true \}/);
  });
  await t.test("空厂商不算优选命中也不崩", () => {
    assert.match(s, /!!a && !!b && \(a\.includes\(b\) \|\| b\.includes\(a\)\)/);
  });
});

test("FIX-3/4：联网空响应落兜底", async t => {
  await t.test("analyzeComponent", () => {
    const s = R("api/_lib/gemini.js");
    assert.match(s, /if \(!result \|\| !result\.partNumber\) \{\s*raw = await callGemini\(sys, `分析器件：\$\{partNumber\}`, 4096, false\)/);
  });
  await t.test("geminiMarketEstimate", () => {
    const s = R("api/_lib/market.js");
    assert.match(s, /if \(!data\?\.parts\) \{\s*raw = await callGemini/);
  });
});

test("FIX-5：recommend 入口净化优选厂商", () => {
  const s = R("api/v2/recommend.js");
  assert.match(s, /const cleanMfrs = \(Array\.isArray\(preferredManufacturers\)/);
  assert.match(s, /String\(m \?\? ""\)\.trim\(\)\)\.filter\(Boolean\)\.slice\(0, 10\)/);
  assert.match(s, /preferredManufacturers: cleanMfrs,/);
});

test("FIX-8：comp 缓存键含参考参数指纹（跨原型号评分错位）", () => {
  const s = R("api/_lib/pipeline.js");
  assert.match(s, /const compKey = pn => `comp:\$\{String\(pn\)\.toLowerCase\(\)\}:\$\{refHash\.toString\(36\)\}`/);
  assert.equal((s.match(/compKey\(pn\)/g) || []).length, 2);
  assert.doesNotMatch(s, /`comp:\$\{pn\.toLowerCase\(\)\}`/);
});

test("FIX-6/7：Content-Type 与 reload", async t => {
  await t.test("图片 MIME 具体化", () => {
    const s = R("api/ezplm-resource.js");
    assert.match(s, /"image\/svg\+xml"/);
    assert.doesNotMatch(s, /return "image\/\*"/);
  });
  await t.test("reload 无废弃布尔参", () => {
    assert.doesNotMatch(R("public/index.src.html"), /location\.reload\(true\)/);
  });
});

test("自审报告随包交付", () => {
  const s = R("SELF_AUDIT_v6.9.10.md");
  assert.match(s, /silent-wrong/);
  assert.match(s, /审查后确认非缺陷/);
});
