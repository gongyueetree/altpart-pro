// GET /api/v2/ecad?pn=&footprint=&kind=&datasheet=&pins=
// eCAD 资源级联：ezPLM（前端已有）→ KiCad 官方库 → PDF 数据手册生成
const { withCors } = require("../_lib/_cors");
const { findSymbol, findFootprint, findModel3D } = require("../_lib/kicad-lib");
const { extractPinsFromPdf } = require("../_lib/pdf-pins");
const { getAiPinout } = require("../_lib/pinout");

/** 提取基础型号（去封装/包装后缀），官方库多以基础型号命名符号 */
function baseMpn(mpn) {
  let s = String(mpn || "").toUpperCase().trim();
  s = s.replace(/[-_](REEL\d*|TR|T\d?|R\d?|\d)$/i, "");
  const m = s.match(/^([A-Z]{1,4}\d{2,6}(?:[A-Z]\d{2,4})?)/);
  if (!m) return s;
  return m[1].replace(/(?<=\d)[A-Z]$/, "");
}

module.exports = withCors(async (req, res) => {
  const { pn, footprint, kind, datasheet, pins, aiPinout } = req.query || {};
  if (!pn) { res.status(400).json({ error: "pn required" }); return; }
  const expectedPins = pins ? parseInt(pins) : null;

  const out = { partNumber: pn, symbol: null, footprint: null, model3d: null, pdfPins: null, sources: {} };

  // ── 符号：KiCad 官方库 ──
  try {
    const sym = await findSymbol({ partNumber: pn, kind, mpnBase: baseMpn(pn) });
    if (sym) { out.symbol = { text: sym.text, name: sym.name, lib: sym.lib, url: sym.url }; out.sources.symbol = "kicad_official"; }
  } catch (e) { console.warn("[ecad] symbol:", e.message); }

  // ── 封装 / 3D：KiCad 官方库（ezPLM 封装名多与 KLC 一致）──
  if (footprint) {
    try {
      const fp = await findFootprint(footprint);
      if (fp) { out.footprint = { text: fp.text, name: fp.name, url: fp.url }; out.sources.footprint = "kicad_official"; }
    } catch (e) { console.warn("[ecad] footprint:", e.message); }
    try {
      const m3 = await findModel3D(footprint);
      if (m3) { out.model3d = { url: m3.url, name: m3.name }; out.sources.model3d = "kicad_official"; }
    } catch (e) { console.warn("[ecad] model3d:", e.message); }
  }

  // ── 官方库无符号 → 从 PDF 数据手册提取引脚定义 ──
  if (!out.symbol && datasheet) {
    try {
      const r = await extractPinsFromPdf(datasheet, expectedPins);
      if (r?.pins?.length) {
        out.pdfPins = r;
        out.sources.symbol = "pdf_datasheet";
      }
    } catch (e) {
      console.warn("[ecad] pdf:", e.message);
      out.pdfError = e.message;
    }
  }

  // ── AI 引脚定义：默认不执行 ──
  // 实测教训：AD8331(20-QSOP，真实引脚 LMD/INH/VPSL/LON/LOP/COML/VIP/VIN/MODE/GAIN/
  // VCM/RCLMP/HILO/VPOS/VOH/VOL/COMM/ENBV/ENBL，无一个 NC) 曾被模型整份编造成
  // INL+/INL-/VNEG/GNEG/VREF/OUT + 10 个 NC。名称层面的幻觉无法用统计特征可靠拦截，
  // 因此只在用户明确要求时才调用，且结果必须显著标注为未验证。
  if (!out.symbol && !out.pdfPins && String(aiPinout) === "1") {
    try {
      const r = await getAiPinout(pn, expectedPins, footprint);
      if (r?.pins?.length) { out.aiPinout = r; out.sources.symbol = "ai_pinout"; }
      // 被拒时把具体原因带回前端，否则用户只看到"没生成引脚名"，无从判断该重试还是该换来源
      else if (r?.rejected) out.aiPinoutRejected = r.rejected;
    } catch (e) {
      console.warn("[ecad] ai pinout:", e.message);
      out.aiPinoutRejected = { code: "ai_call_failed", message: "AI 引脚推断执行失败", detail: e.message };
    }
  }

  res.status(200).json({ success: true, ...out });
}, ["GET"]);
