// GET /api/lifecycle/[pn] — 生命周期与合规查询
const { withCors } = require("../_lib/_cors");
const { cache } = require("../_lib/cache");
const { getMarketInfo } = require("../_lib/market");
const { guardApi } = require("../_lib/security");
const { queryLocalDB } = require("../_lib/ezplm");

module.exports = withCors(async (req, res) => {
  const pn = req.query.pn;
  if (!pn) { res.status(400).json({ error: "partNumber required" }); return; }
  if (!guardApi(req, res, { cost: 1 })) return;

  const ck = `lifecycle:${pn.toLowerCase()}`;
  const cached = cache.get(ck);
  if (cached) { res.status(200).json(cached); return; }

  let result = unknownLifecycle(pn);
  try {
    // 生命周期必须绑定到已确认的 MPN + 厂商，避免不同厂商复用同一短型号时串数据。
    const exact = await queryLocalDB(pn, { exactOnly: true });
    if (!exact?.manufacturer) {
      cache.set(ck, result, 24 * 3600);
      res.status(200).json(result);
      return;
    }
    const market = await getMarketInfo(
      [pn],
      { region: "US", currency: "USD", quantity: 1, packaging: "any" },
      { allowEstimate: false, manufacturers: { [pn]: exact.manufacturer } },
    );
    const info = market.parts?.[pn];
    if (info?.source === "distributor_api" && info.lifecycle) {
      result = {
        ...result,
        lifecycle: normalizeLifecycle(info.lifecycle),
        evidence: [{ source: "distributor_api", value: info.lifecycle,
          retrievedAt: info.offers?.find(o => o.lifecycle)?.retrievedAt || new Date().toISOString() }],
        _source: "distributor_api",
        _note: "生命周期来自精确 MPN 的分销商记录；合规状态仍需原厂变体级证据",
      };
    }
  } catch (e) { console.warn("[lifecycle]", e.message); }
  cache.set(ck, result, 24 * 3600);
  res.status(200).json(result);
}, ["GET"]);

function normalizeLifecycle(value) {
  const text = String(value || "").toLowerCase();
  if (/obsolete|discontinued|eol|停产/.test(text)) return "obsolete";
  if (/not recommended|nrnd|不推荐/.test(text)) return "nrnd";
  if (/active|production|量产/.test(text)) return "active";
  return "unknown";
}

function unknownLifecycle(partNumber) {
  return {
    partNumber, lifecycle: "unknown",
    compliance: { rohs: null, reach: null, halogenFree: null, automotive: null, industrial: null },
    evidence: [],
    _source: "unavailable",
    _note: "没有原厂或精确变体级证据时返回 Unknown，不根据型号前缀推断生命周期或合规",
  };
}

module.exports.normalizeLifecycle = normalizeLifecycle;
module.exports.unknownLifecycle = unknownLifecycle;
