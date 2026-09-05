// POST /api/v2/market — 批量查询价格/供货行情
// body: { partNumbers: ["PN1","PN2",...] }（最多8个）
// 返回: { success, parts: { PN: {priceUSD1,priceUSD100,stock,channels,note,source} } }
const { withCors } = require("../_lib/_cors");
const { getMarketInfo } = require("../_lib/market");
const { fail, ok, classifyUpstream } = require("../_lib/http");
const { normalizeProcurement } = require("../_lib/procurement");
const { guardApi } = require("../_lib/security");

const MAX_BATCH = 8;

module.exports = withCors(async (req, res) => {
  const { partNumbers, procurement: rawProcurement, manufacturers } = req.body || {};
  if (!Array.isArray(partNumbers) || !partNumbers.length) {
    return fail(res, "BAD_REQUEST", "partNumbers 必须是非空数组");
  }
  // 此前超过上限会静默截断并返回成功，调用方无从得知丢了型号
  if (partNumbers.length > MAX_BATCH) {
    return fail(res, "BAD_REQUEST",
      `单次最多查询 ${MAX_BATCH} 个型号，收到 ${partNumbers.length} 个；请分批调用`,
      { details: { max: MAX_BATCH, received: partNumbers.length } });
  }
  if (!guardApi(req, res, { cost: 2 })) return;
  let procurement;
  try { procurement = normalizeProcurement(rawProcurement || {}); }
  catch (e) { return fail(res, "BAD_REQUEST", e.message); }
  try {
    const safeManufacturers = manufacturers && typeof manufacturers === "object" && !Array.isArray(manufacturers)
      ? Object.fromEntries(Object.entries(manufacturers).slice(0, MAX_BATCH)
        .map(([pn, mfr]) => [String(pn).slice(0, 128), String(mfr || "").slice(0, 128)]))
      : {};
    const result = await getMarketInfo(partNumbers, procurement, { manufacturers: safeManufacturers });
    return ok(res, result);
  } catch (e) {
    console.error("[market]", e.message);
    return fail(res, classifyUpstream(e), e.message || "行情查询失败");
  }
}, ["POST"]);
