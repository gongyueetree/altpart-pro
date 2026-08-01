// POST /api/v2/recommend — 替代料推荐
// 线上实测：五种模式三种失败，页面只显示"推荐失败，请稍后重试"，无法定位。
// 本端点为每个阶段建立业务错误码，让"无候选"与"系统故障"彻底分开。
const { withCors } = require("../_lib/_cors");
const { runPipeline } = require("../_lib/pipeline");
const { bizFail, ok, requestId, classifyUpstream } = require("../_lib/http");
const { PROFILES } = require("../_lib/rule-profiles");

module.exports = withCors(async (req, res) => {
  const rid = requestId();
  const t0 = Date.now();
  const { partNumber, mode = "funcCompat", scenario, application = "generic",
          preferredManufacturers, constraints, priorityOrder, original } = req.body || {};

  if (!partNumber || typeof partNumber !== "string")
    return bizFail(res, "INVALID_REQUEST", "partNumber 必填且须为字符串", { requestId: rid, stage: "validate" });
  if (mode && !PROFILES[mode])
    return bizFail(res, "INVALID_REQUEST", `未知替代模式：${mode}`, { requestId: rid, stage: "validate",
      details: { allowed: Object.keys(PROFILES) } });

  // 原器件必须已通过存在性验证；未验证型号不得消耗推荐配额
  if (original && (original.unverified || original.fictitious))
    return bizFail(res, "PART_UNVERIFIED", `原型号 ${partNumber} 未经权威来源验证，无法执行推荐`,
      { requestId: rid, stage: "identity" });

  // 约束合法性：非法约束不得进入评分（线上曾接受 min=6 / max=4）
  if (constraints && typeof constraints === "object" && original?.parameters) {
    const { validateConstraint } = require("../_lib/scoring-node");
    for (const [pid, con] of Object.entries(constraints)) {
      const param = (original.parameters || []).find(p => p.id === pid);
      const v = validateConstraint(con, param);
      if (!v.valid)
        return bizFail(res, "INVALID_REQUEST", v.error,
          { requestId: rid, stage: "validate", details: { paramId: pid, param: param?.name } });
    }
  }

  const stages = [];
  const mark = (name, extra = {}) => stages.push({ stage: name, atMs: Date.now() - t0, ...extra });

  try {
    const result = await runPipeline({
      partNumber, mode, scenario, application,
      preferredManufacturers: preferredManufacturers || [],
      constraints: constraints || {},
      priorityOrder, originalData: original,
      onProgress: msg => mark("progress", { msg }),
    });
    mark("scored", { candidates: result.recommendations?.length || 0,
                     eliminated: result.eliminated?.length || 0 });

    // ── 业务级"无候选"：不是系统失败，要给出稳定 code 与原因 ──
    // 正式候选与待核验候选都为空，才算真正无结果
    if (!result.recommendations?.length && !result.pendingVerification?.length) {
      const elim = result.eliminated || [];
      const pinBlocked = elim.filter(e => /引脚|pin/i.test(e.reason || "")).length;
      const code = mode === "pin2pin" && pinBlocked > 0 ? "PIN_EVIDENCE_MISSING" : "NO_VERIFIED_CANDIDATES";
      return bizFail(res, code,
        mode === "pin2pin"
          ? `Pin-to-Pin 模式下没有满足封装一致且可验证的候选（共排除 ${elim.length} 个）`
          : `没有找到满足「${PROFILES[mode]?.label || mode}」模式与当前约束的已验证候选（共排除 ${elim.length} 个）`,
        { requestId: rid, stage: "candidate_validation",
          details: {
            mode, modeNote: PROFILES[mode]?.note,
            eliminatedCount: elim.length,
            eliminated: elim.slice(0, 20),
            pipeline: result.pipeline,
          } });
    }

    if (!result.recommendations?.length && result.pendingVerification?.length) {
      result.onlyPending = true;
      result.notice = `未找到有权威来源支撑的候选；以下 ${result.pendingVerification.length} 个为待核验候选，需人工核对 datasheet`;
    }

    // 附加市场行情与成本差异（失败不影响推荐主体）
    try {
      const { getMarketInfo } = require("../_lib/market");
      const pns = [partNumber, ...result.recommendations.map(r => r.partNumber)].slice(0, 8);
      const mk = await getMarketInfo(pns);
      const base = mk.parts?.[partNumber]?.priceUSD100 ?? mk.parts?.[partNumber]?.priceUSD1 ?? null;
      result.market = mk.parts; result.basePrice = base;
      result.recommendations = result.recommendations.map(r => {
        const m = mk.parts?.[r.partNumber];
        const p = m?.priceUSD100 ?? m?.priceUSD1 ?? null;
        const costDelta = base != null && p != null ? +(p - base).toFixed(4) : null;
        return { ...r, market: m || null, costDelta,
          costDeltaPct: costDelta != null && base > 0 ? +((costDelta / base) * 100).toFixed(1) : null };
      });
      mark("market", { priced: Object.keys(mk.parts || {}).length });
    } catch (e) {
      mark("market_failed", { error: e.message });
      result.marketWarning = "行情数据获取失败，成本对比不可用";
    }

    return ok(res, { ...result, requestId: rid, timings: stages, totalMs: Date.now() - t0 });
  } catch (e) {
    console.error(`[recommend][${rid}]`, e.message);
    // 上游异常可能被 pipeline 包装，需看 cause 才能正确分类
    const root = e.cause || e;
    const upstream = classifyUpstream(root);
    const code = /JSON|解析/.test(root.message || e.message) ? "AI_INVALID_RESPONSE"
               : upstream === "UPSTREAM_TIMEOUT" ? "UPSTREAM_TIMEOUT"
               : upstream === "RATE_LIMITED" ? "RATE_LIMITED"
               : upstream === "UPSTREAM_ERROR" ? "UPSTREAM_UNAVAILABLE"
               : e.noCandidates ? "NO_VERIFIED_CANDIDATES"
               : "INTERNAL_ERROR";
    return bizFail(res, code, e.message || "推荐流程失败",
      { requestId: rid, stage: "pipeline", diagnostics: { stages, totalMs: Date.now() - t0 } });
  }
}, ["POST"]);
