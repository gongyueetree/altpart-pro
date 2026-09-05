// GET /api/v2/part-detail/:pn — 器件详情（ezPLM参数/参考设计/可下载资源 + 实时行情）
const { withCors } = require("../../_lib/_cors");
const { queryPartDetail } = require("../../_lib/ezplm");
const { getMarketInfo, buildManufacturerHints } = require("../../_lib/market");
const { guardApi } = require("../../_lib/security");

module.exports = withCors(async (req, res) => {
  const pn = req.query.pn;
  if (!pn) { res.status(400).json({ error: "partNumber required" }); return; }
  if (!guardApi(req, res, { cost: 2 })) return;

  const detail = await queryPartDetail(pn).catch(() => null);
  const market = await getMarketInfo(
    [pn], {},
    { manufacturers: buildManufacturerHints(detail ? [detail] : []) },
  ).catch(() => ({ parts: {} }));
  const m = market.parts?.[pn] || null;

  if (!detail) {
    res.status(200).json({
      partNumber: pn, inPLM: false,
      message: "该器件未收录于 ezPLM 元器件库",
      parameters: [], referenceDesigns: [], downloads: [], market: m,
    });
    return;
  }
  res.status(200).json({ ...detail, inPLM: true, market: m });
}, ["GET"]);
