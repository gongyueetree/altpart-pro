// POST /api/bom/process — BOM 批量推荐
// Serverless 适配：直接调用 pipeline，不再 fetch localhost
const { withCors } = require("../_lib/_cors");
const { runPipeline } = require("../_lib/pipeline");
const { PROFILES } = require("../_lib/rule-profiles");
const { normalizeProcurement } = require("../_lib/procurement");
const { settleMapLimit } = require("../_lib/async-utils");
const { guardApi } = require("../_lib/security");

// Vercel 单函数默认超时 10s（Hobby）/ 60s（Pro）。批量逐个调 AI 容易超时，
// 因此限制单批数量；大 BOM 建议前端分批多次调用。
const MAX_ITEMS = 8;

module.exports = withCors(async (req, res) => {
  const { items, mode = "funcCompat", scenario, application = "generic", preferredManufacturers,
    constraints, procurement: rawProcurement } = req.body || {};
  if (!items?.length) { res.status(400).json({ error: "缺少 BOM 物料列表" }); return; }
  if (!Array.isArray(items) || items.some(item => !item || typeof item.partNumber !== "string" || !item.partNumber.trim())) {
    res.status(400).json({ error: "每条 BOM 物料必须包含有效的 partNumber" }); return;
  }
  if (!PROFILES[mode]) { res.status(400).json({ error: `未知替代模式：${mode}` }); return; }
  if (items.length > MAX_ITEMS) {
    res.status(400).json({ error: `单次最多处理 ${MAX_ITEMS} 个物料（Serverless 超时限制），请分批提交` });
    return;
  }
  if (!guardApi(req, res, { cost: Math.max(5, items.length * 3) })) return;

  let procurement;
  try { procurement = normalizeProcurement(rawProcurement || {}); }
  catch (e) { res.status(400).json({ error: e.message }); return; }
  const cleanMfrs = (Array.isArray(preferredManufacturers) ? preferredManufacturers : [])
    .map(m => String(m || "").trim()).filter(Boolean).slice(0, 10);

  // 同时最多跑 2 条完整推荐链路；既缩短总时间，也避免 8×候选查询瞬时打满上游。
  const settled = await settleMapLimit(items, 2, async item => {
      const rec = await runPipeline({
        partNumber: item.partNumber.trim(), mode, scenario, application,
        preferredManufacturers: cleanMfrs,
        constraints: constraints?.[item.partNumber] || item.constraints || {},
        procurement,
      });
      const formal = rec.recommendations?.[0];
      const pending = rec.pendingVerification?.[0];
      const top = formal || pending;
      const level = top?.replacementLevel?.level || null;
      const direct = level === "DIRECT_REPLACEMENT";
      const review = level === "COMPATIBLE_WITH_REVIEW";
      return {
        ...item,
        status: formal ? "found" : pending ? "pending_verification" : "no_match",
        topAlternative: top?.partNumber || "-",
        topManufacturer: top?.manufacturer || "-",
        topScore: top?.overallScore ?? 0,
        replacementLevel: level || "-",
        pcbChange: !top ? "-" : direct ? "否" : review ? "需核对" : "可能/需要",
        softwareChange: !top ? "-" : direct ? "否" : "需验证",
        alternativeCount: rec.recommendations?.length || 0,
        pendingCount: rec.pendingVerification?.length || 0,
        pendingReason: pending?.pendingReason || null,
        eliminatedCount: rec.eliminated?.length || 0,
      };
  });

  const results = settled.map((entry, index) => entry.status === "fulfilled" ? entry.value : ({
    ...items[index], status: "error", topAlternative: "-", topManufacturer: "-", topScore: 0,
    replacementLevel: "-", pcbChange: "-", softwareChange: "-", alternativeCount: 0,
    pendingCount: 0, error: entry.reason?.message || "处理失败",
  }));
  const errors = results.filter(r => r.status === "error").map(r => ({ partNumber: r.partNumber, error: r.error }));

  const summary = {
    total: results.length,
    found: results.filter(r => r.status === "found").length,
    pendingVerification: results.filter(r => r.status === "pending_verification").length,
    noMatch: results.filter(r => r.status === "no_match").length,
    errors: errors.length,
    directReplacement: results.filter(r => r.replacementLevel === "DIRECT_REPLACEMENT").length,
    compatibleWithReview: results.filter(r => r.replacementLevel === "COMPATIBLE_WITH_REVIEW").length,
    functionalAlternative: results.filter(r => r.replacementLevel === "FUNCTIONAL_ALTERNATIVE").length,
    redesignRequired: results.filter(r => r.replacementLevel === "REDESIGN_REQUIRED").length,
  };
  res.status(200).json({ success: true, results, errors, summary,
    execution: { mode: "bounded_concurrency", concurrency: 2, maxItems: MAX_ITEMS }, procurement });
}, ["POST"]);
