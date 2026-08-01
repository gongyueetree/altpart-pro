// POST /api/v2/analyze — 仅解析原始器件参数（ezPLM本地库优先 → AI兜底）
// 供两段式流程使用：先展示参数让用户调整优先级/约束，再调 /api/v2/recommend
const { withCors } = require("../_lib/_cors");
const { resolveOriginalPart } = require("../_lib/pipeline");
const { fail, ok } = require("../_lib/http");

module.exports = withCors(async (req, res) => {
  const { partNumber } = req.body || {};
  if (!partNumber) { res.status(400).json({ error: "partNumber required" }); return; }

  try {
    const original = await resolveOriginalPart(partNumber.trim());

    // ── 权威存在性校验 ──
    // 只有 ezPLM / 分销商 exact 命中才算"该型号真实存在"；AI 描述不算证据。
    if (original?.fictitious) {
      return fail(res, "NOT_FOUND", `未找到型号 ${partNumber}，请检查拼写或改用候选型号`, {
        details: { code: "PART_NOT_FOUND", requestedMpn: partNumber, reason: "无权威来源证明该型号存在" },
      });
    }
    if (original?.unverified) {
      // 有 AI 数据但无权威来源：不进工作台，返回可读提示与建议
      return fail(res, "UNPROCESSABLE", `型号 ${partNumber} 未能在 ezPLM 与分销商数据库中确认存在`, {
        details: {
          code: "PART_UNVERIFIED", requestedMpn: partNumber,
          hint: "AI 无法证明型号存在。请确认拼写，或输入完整订货型号。",
          aiSuggestion: original.partNumber !== partNumber ? original.partNumber : undefined,
        },
      });
    }
    return ok(res, { original });
  } catch (e) {
    console.error("[analyze] failed:", e.message);
    return fail(res, "INTERNAL", e.message || "器件参数解析失败");
  }
}, ["POST"]);
