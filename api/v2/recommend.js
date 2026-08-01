// POST /api/v2/recommend — 本地优先推荐（10选5）
const { withCors } = require("../_lib/_cors");
const { runPipeline } = require("../_lib/pipeline");

module.exports = withCors(async (req, res) => {
  const { partNumber, mode = "funcCompat", scenario, application = "generic", preferredManufacturers, constraints, priorityOrder, original } = req.body || {};
  if (!partNumber) { res.status(400).json({ error: "partNumber required" }); return; }

  try {
    const result = await runPipeline({
      partNumber, mode, scenario, application,
      preferredManufacturers: preferredManufacturers || [],
      constraints: constraints || {},
      priorityOrder,
      originalData: original,
    });
    // 成本差异：原型号 vs 各候选（基于实时行情/AI估算）
    try {
      const { getMarketInfo } = require("../_lib/market");
      const pns = [partNumber, ...result.recommendations.map(r => r.partNumber)];
      const mk = await getMarketInfo(pns);
      const basePrice = mk.parts?.[partNumber]?.priceUSD100 ?? mk.parts?.[partNumber]?.priceUSD1 ?? null;
      result.market = mk.parts;
      result.basePrice = basePrice;
      result.recommendations = result.recommendations.map(r => {
        const m = mk.parts?.[r.partNumber];
        const p = m?.priceUSD100 ?? m?.priceUSD1 ?? null;
        let costDelta = null, costDeltaPct = null;
        if (basePrice != null && p != null) {
          costDelta = +(p - basePrice).toFixed(4);
          costDeltaPct = basePrice > 0 ? +(((p - basePrice) / basePrice) * 100).toFixed(1) : null;
        }
        return { ...r, market: m || null, costDelta, costDeltaPct };
      });
    } catch (e) { console.warn("[recommend] 行情附加失败:", e.message); }

    res.status(200).json({ success: true, ...result });
  } catch (e) {
    // 返回明确错误信息（而非笼统500），便于前端提示和排查
    console.error("[recommend] pipeline failed:", e.message);
    res.status(200).json({
      success: false,
      error: e.message || "推荐流程失败",
      partNumber,
      recommendations: [],
      hint: /候选|AI/.test(e.message || "")
        ? "AI 候选查询失败，可能是 Gemini 限流或该型号资料不足，请稍后重试"
        : "推荐流程异常，请查看 Vercel 函数日志",
    });
  }
}, ["POST"]);
