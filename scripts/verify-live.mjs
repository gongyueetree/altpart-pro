#!/usr/bin/env node
/**
 * 生产环境验收脚本 —— 针对已配置真实密钥的部署运行。
 *
 * 用法：
 *   node scripts/verify-live.mjs https://your-app.vercel.app
 *   node scripts/verify-live.mjs http://localhost:3000
 *
 * 本脚本只做只读查询与契约校验，不写入任何数据。
 * 它验证的是"真实上游 API 是否按预期工作"，这部分无法在无密钥环境完成。
 */
const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE) { console.error("用法: node scripts/verify-live.mjs <部署地址>"); process.exit(1); }

let pass = 0, fail = 0, warn = 0;
const T = 60000;

const j = async (path, init) => {
  const r = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(T) });
  let body = null;
  try { body = await r.json(); } catch { body = { _raw: "(非 JSON)" }; }
  return { status: r.status, body };
};
const post = (path, payload) => j(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

function check(name, cond, detail = "") {
  if (cond === true) { console.log(`  ✓ ${name}`); pass++; }
  else if (cond === "warn") { console.log(`  ⚠ ${name} ${detail}`); warn++; }
  else { console.log(`  ✗ ${name} ${detail}`); fail++; }
}

console.log(`\n═══ AltPart Pro 生产验收 · ${BASE} ═══\n`);

// ── 1. 健康检查与版本一致性 ──
console.log("【1】健康检查与配置");
{
  const { status, body } = await j("/api/health");
  check("HTTP 200", status === 200, `实际 ${status}`);
  const c = body?.config || {};
  check("Gemini 已配置", c.geminiConfigured === true);
  check("ezPLM 已配置", c.ezplmConfigured === true, "(未配置则本地库优先失效)");
  console.log(`    service=${body?.service} model=${c.geminiModel} mode=${c.mode}`);
  console.log(`    scoringEngine=${c.scoringEngine}`);
}

// ── 2. ezPLM 真实连通 ──
console.log("\n【2】ezPLM 真实 API");
{
  const st = await j("/api/ezplm?path=status");
  check("status 端点可用", st.status === 200 && st.body?.configured === true);
  const p = await j("/api/ezplm?path=parts&keyword=TPS62160&pageSize=5");
  const items = p.body?.data || [];
  check("parts 查询返回数据", p.status === 200 && items.length > 0, `status=${p.status} 条数=${items.length}`);
  if (items.length) {
    const it = items[0];
    check("返回含 mpn", !!it.mpn, JSON.stringify(Object.keys(it)).slice(0, 120));
    check("manufacturer 为对象且含 name", !!it.manufacturer?.name);
    check("footprint 含 kicadModFile.url", !!it.footprint?.kicadModFile?.url, "(影响 eCAD 真实封装)");
    console.log(`    样例: ${it.mpn} / ${it.manufacturer?.name} / ${it.footprint?.name || "无封装"}`);
    console.log(`    symbol 字段: ${it.symbol ? "有" : "null（将回退 KiCad 官方库/PDF）"}`);
  }
}

// ── 3. 器件分析（ezPLM → 分销商 → AI 级联）──
console.log("\n【3】器件分析级联");
let analyzed = null;
{
  const r = await post("/api/v2/analyze", { partNumber: "TPS62160DGKR" });
  check("analyze 成功", r.status === 200 && r.body?.success === true, `status=${r.status}`);
  analyzed = r.body?.original;
  if (analyzed) {
    check("参数数量 ≥5", (analyzed.parameters || []).length >= 5, `实际 ${(analyzed.parameters || []).length}`);
    const srcs = [...new Set((analyzed.parameters || []).map(p => p.sourceLabel || p.source))];
    console.log(`    数据路径: ${analyzed._dataPath} | 来源: ${srcs.join(", ")}`);
    check("数据来自 ezPLM 而非纯 AI", /local_db|ezplm|digikey|mouser/.test(analyzed._dataPath || ""),
      `_dataPath=${analyzed._dataPath}`);
  }
}

// ── 4. 推荐链路 + 关键回归 ──
console.log("\n【4】推荐链路");
{
  const r = await post("/api/v2/recommend", { partNumber: "TPS62160DGKR", mode: "funcCompat", application: "generic" });
  check("recommend 返回", r.status === 200, `status=${r.status}`);
  const recs = r.body?.recommendations || [];
  if (r.body?.success === false) {
    check("推荐流程可用", "warn", `后端返回: ${r.body?.error}`);
  } else {
    check("有推荐结果", recs.length > 0, `数量 ${recs.length}`);
    const bad = recs.filter(x => x.replacementLevel?.level === "DIRECT_REPLACEMENT" && !x.pinVerified);
    check("无 Pin Map 却判直接替代 = 0", bad.length === 0, bad.map(x => x.partNumber).join(","));
    const rejected = recs.filter(x => x.replacementLevel?.level === "REJECTED");
    check("REJECTED 不出现在推荐列表", rejected.length === 0);
    for (const x of recs.slice(0, 3))
      console.log(`    ${x.partNumber} [${x.replacementLevel?.level}] 技术${x.technical} 覆盖${x.evidenceCoverage}% 可信${x.confidence}`);
  }
}

// ── 5. 市场行情（真实分销商）──
console.log("\n【5】市场行情 · DigiKey/Mouser");
{
  const r = await post("/api/v2/market", { partNumbers: ["TPS62160DGKR", "LM358ADR"] });
  check("market 成功", r.status === 200 && r.body?.success === true, `status=${r.status}`);
  const parts = r.body?.parts || {};
  const real = Object.values(parts).filter(m => m?.source === "distributor_api");
  check("命中真实分销商报价", real.length > 0,
    real.length ? "" : `全部为 ${[...new Set(Object.values(parts).map(m => m?.source))].join(",")}（分销商密钥可能未生效）`);
  for (const [pn, m] of Object.entries(parts))
    console.log(`    ${pn}: $${m?.priceUSD1 ?? "?"} | ${m?.stock} | ${m?.source}`);
}

// ── 6. 契约：批量上限必须 400 ──
console.log("\n【6】API 契约");
{
  const r = await post("/api/v2/market", { partNumbers: Array.from({ length: 10 }, (_, i) => `PN${i}`) });
  check("超量返回 400 而非静默截断", r.status === 400, `实际 ${r.status}`);
  check("错误体含 code/requestId", !!r.body?.error?.code && !!r.body?.error?.requestId);
  const e = await post("/api/v2/market", { partNumbers: [] });
  check("空数组返回 400", e.status === 400, `实际 ${e.status}`);
  const g = await j("/api/v2/market");
  check("GET 返回 405", g.status === 405, `实际 ${g.status}`);
}

// ── 7. eCAD 级联 ──
console.log("\n【7】eCAD 级联");
{
  const q = new URLSearchParams({ pn: "LM358ADR", footprint: "SOIC-8_3.9x4.9mm_P1.27mm", kind: "opamp" });
  const r = await j(`/api/v2/ecad?${q}`);
  check("ecad 成功", r.status === 200 && r.body?.success === true, `status=${r.status}`);
  const s = r.body?.sources || {};
  console.log(`    符号来源: ${s.symbol || "无"} | 封装来源: ${s.footprint || "无"} | 3D: ${s.model3d || "无"}`);
  check("KiCad 官方库可达", !!(s.footprint || s.symbol || s.model3d),
    "(gitlab 不可达则全部回退合成)");
}

// ── 8. 资源代理 ──
console.log("\n【8】资源代理安全");
{
  const bad = await j(`/api/ezplm-resource?url=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`);
  check("拒绝非白名单主机(SSRF 防护)", bad.status === 403 || bad.status === 400, `实际 ${bad.status}`);
  const none = await j("/api/ezplm-resource");
  check("缺 url 参数返回 400", none.status === 400, `实际 ${none.status}`);
}

console.log(`\n═══ 结果：通过 ${pass} · 失败 ${fail} · 警告 ${warn} ═══`);
if (fail) console.log("失败项需要排查后再对外提供服务。");
process.exit(fail ? 1 : 0);
