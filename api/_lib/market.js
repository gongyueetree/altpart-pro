// market.js — 实时价格/库存
// 优先级: DigiKey API → Mouser API → Gemini估算(标注仅供参考)
// 未配置分销商 Key 时自动走 Gemini 兜底，接入后自动切换真实数据

const { callGemini, repairJSON } = require("./gemini");
const { cache } = require("./cache");
const { normalizeLeadTime, pickStrictExact } = require("./distributor");
const { normalizeProcurement, procurementCacheKey } = require("./procurement");
const { settleMapLimit } = require("./async-utils");
const { canonicalManufacturer } = require("./part-identity");

const TTL_REAL = 2 * 3600;    // 真实报价缓存2小时
const TTL_EST = 12 * 3600;    // AI估算缓存12小时

/* ══════════ DigiKey ══════════ */
let dkToken = null, dkTokenExp = 0;

async function digikeyToken() {
  const id = process.env.DIGIKEY_CLIENT_ID, secret = process.env.DIGIKEY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (dkToken && Date.now() < dkTokenExp) return dkToken;
  try {
    const r = await fetch("https://api.digikey.com/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    dkToken = j.access_token;
    dkTokenExp = Date.now() + (j.expires_in - 60) * 1000;
    return dkToken;
  } catch (e) { console.warn("[digikey] token失败:", e.message); return null; }
}

const SITE_BY_REGION = { CN: "CN", HK: "HK", US: "US", EU: "DE" };
const PACKAGING_RE = {
  tape: /tape\s*(?:&|and)?\s*reel|reel/i, tube: /tube/i, tray: /tray/i,
  cut: /cut\s*tape|strip|bulk/i,
};
function packagingMatches(label, wanted) {
  return !wanted || wanted === "any" || !!PACKAGING_RE[wanted]?.test(String(label || ""));
}
function priceAtQuantity(tiers, quantity, moq = 1) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q < Number(moq || 1)) return null;
  const rows = (tiers || []).map(t => ({ qty: Number(t.qty), price: Number(t.price) }))
    .filter(t => Number.isFinite(t.qty) && Number.isFinite(t.price) && t.qty > 0 && t.price >= 0)
    .sort((a, b) => a.qty - b.qty);
  const eligible = rows.filter(t => t.qty <= q);
  return eligible.length ? eligible[eligible.length - 1].price : null;
}

function manufacturerMatches(actual, expected) {
  if (!expected) return true;
  const a = canonicalManufacturer(actual);
  const e = canonicalManufacturer(expected);
  return !!a && !!e && a === e;
}

function expectedManufacturerFor(options, pn) {
  const manufacturers = options?.manufacturers;
  if (!manufacturers || typeof manufacturers !== "object") return "";
  const direct = manufacturers[pn] ?? manufacturers[String(pn).toUpperCase()];
  if (direct != null) return String(direct);
  const key = Object.keys(manufacturers).find(k => k.toUpperCase() === String(pn).toUpperCase());
  return key ? String(manufacturers[key] || "") : "";
}

function marketCacheKey(pn, procKey, manufacturer) {
  const mfr = canonicalManufacturer(manufacturer) || "ANY";
  return `market:${String(pn).toLowerCase()}:${mfr}:${procKey}`;
}

function buildManufacturerHints(parts = []) {
  const out = {};
  for (const part of parts) {
    const pn = String(part?.partNumber || part?.mpn || "").trim();
    const mfr = String(part?.manufacturer || "").trim();
    if (!pn || !mfr) continue;
    const existingKey = Object.keys(out).find(k => k.toUpperCase() === pn.toUpperCase());
    if (!existingKey) out[pn] = mfr;
    else if (out[existingKey] && canonicalManufacturer(out[existingKey]) !== canonicalManufacturer(mfr)) {
      // 同 MPN 在本次结果中属于不同厂商，不能用单一 hint 偏向其中任意一方。
      out[existingKey] = "";
    }
  }
  return out;
}

async function digikeySearch(pn, procurement, expectedManufacturer = "") {
  const token = await digikeyToken();
  if (!token) return null;
  const proc = normalizeProcurement(procurement);
  try {
    const r = await fetch("https://api.digikey.com/products/v4/search/keyword", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-DIGIKEY-Client-Id": process.env.DIGIKEY_CLIENT_ID,
        "X-DIGIKEY-Locale-Site": SITE_BY_REGION[proc.region] || process.env.DIGIKEY_SITE || "US",
        "X-DIGIKEY-Locale-Currency": proc.currency,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Keywords: pn, Limit: 10 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const p = pickStrictExact(j?.Products || [], pn, x => x.ManufacturerProductNumber);
    if (!p) return null;
    if (!manufacturerMatches(p.Manufacturer?.Name, expectedManufacturer)) return null;
    const variations = Array.isArray(p.ProductVariations) ? p.ProductVariations : [];
    const variation = variations.find(v => packagingMatches(v.PackageType?.Name || v.PackageType, proc.packaging))
      || (proc.packaging === "any" ? variations[0] : null);
    if (proc.packaging !== "any" && variations.length && !variation) return null;
    const packaging = variation?.PackageType?.Name || variation?.PackageType || p.Packaging || "";
    return {
      vendor: "DigiKey",
      mpn: p.ManufacturerProductNumber,
      manufacturer: p.Manufacturer?.Name || "",
      stock: variation?.QuantityAvailableforPackageType ?? variation?.QuantityAvailableForPackageType ?? p.QuantityAvailable ?? null,
      moq: variation?.MinimumOrderQuantity ?? p.MinimumOrderQuantity ?? 1,
      packaging,
      currency: proc.currency,
      tiers: (variation?.StandardPricing || p.StandardPricing || [])
        .map(t => ({ qty: Number(t.BreakQuantity), price: Number(t.UnitPrice) }))
        .filter(t => Number.isFinite(t.qty) && Number.isFinite(t.price)),
      url: p.ProductUrl || undefined,
      retrievedAt: new Date().toISOString(),
      leadTime: normalizeLeadTime(p.ManufacturerLeadWeeks, "weeks"),
      lifecycle: p.ProductStatus?.Status || null,
    };
  } catch (e) { console.warn("[digikey] search失败:", e.message); return null; }
}

/* ══════════ Mouser ══════════ */
async function mouserSearch(pn, procurement, expectedManufacturer = "") {
  const key = process.env.MOUSER_API_KEY;
  if (!key) return null;
  const proc = normalizeProcurement(procurement);
  try {
    const r = await fetch(`https://api.mouser.com/api/v1/search/partnumber?apiKey=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: pn, partSearchOptions: "Exact" } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const p = pickStrictExact(j?.SearchResults?.Parts || [], pn, x => x.ManufacturerPartNumber);
    if (!p) return null;
    if (!manufacturerMatches(p.Manufacturer, expectedManufacturer)) return null;
    if (!packagingMatches(p.Packaging, proc.packaging)) return null;
    const num = s => { const m = String(s || "").match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
    return {
      vendor: "Mouser",
      mpn: p.ManufacturerPartNumber,
      manufacturer: p.Manufacturer || "",
      stock: num(p.AvailabilityInStock) ?? null,
      moq: num(p.Min) ?? 1,
      packaging: p.Packaging || "",
      currency: String(p.Currency || "USD").toUpperCase(),
      tiers: (p.PriceBreaks || []).map(t => ({ qty: Number(t.Quantity), price: num(t.Price) }))
        .filter(t => Number.isFinite(t.qty) && Number.isFinite(t.price)),
      url: p.ProductDetailUrl,
      retrievedAt: new Date().toISOString(),
      leadTime: normalizeLeadTime(p.LeadTime, /week|周/i.test(String(p.LeadTime||"")) ? "weeks" : "days"),
      lifecycle: p.LifecycleStatus || null,
    };
  } catch (e) { console.warn("[mouser] search失败:", e.message); return null; }
}

/* ══════════ 统一入口 ══════════ */
async function getMarketInfo(partNumbers, procurement = {}, options = {}) {
  const proc = normalizeProcurement(procurement);
  const procKey = procurementCacheKey(proc);
  const pns = [...new Set(partNumbers.map(p => String(p).trim()).filter(Boolean))].slice(0, 8);
  const result = {};
  const missing = [];

  for (const pn of pns) {
    const expectedManufacturer = expectedManufacturerFor(options, pn);
    const hit = cache.get(marketCacheKey(pn, procKey, expectedManufacturer));
    if (hit && (options.allowEstimate !== false || hit.source !== "ai_estimate")) result[pn] = hit;
    else missing.push(pn);
  }
  if (!missing.length) return { parts: result };

  const hasDistributor = !!(process.env.DIGIKEY_CLIENT_ID || process.env.MOUSER_API_KEY);

  if (hasDistributor) {
    const settled = await settleMapLimit(missing, 3, async pn => {
      const expectedManufacturer = expectedManufacturerFor(options, pn);
      const [dk, mo] = await Promise.all([
        digikeySearch(pn, proc, expectedManufacturer),
        mouserSearch(pn, proc, expectedManufacturer),
      ]);
      const offers = [dk, mo].filter(Boolean);
      if (!offers.length) return { pn, info: null };
      const manufacturers = [...new Set(offers.map(o => canonicalManufacturer(o.manufacturer)).filter(Boolean))];
      // 同一个 MPN 可能被不同厂商复用。调用方没有给出厂商且渠道互相冲突时，
      // 宁可不给价格/生命周期结论，也不能把两颗不同器件的报价合并。
      const identityConflict = !expectedManufacturer && manufacturers.length > 1;
      for (const offer of offers) offer.unitPrice = priceAtQuantity(offer.tiers, proc.quantity, offer.moq);
      const eligible = identityConflict ? [] : offers.filter(o => o.currency === proc.currency && o.unitPrice != null &&
        (!proc.inStockOnly || Number(o.stock) >= proc.quantity));
      const best = eligible.sort((a, b) => a.unitPrice - b.unitPrice)[0] || null;
      const price1 = best ? priceAtQuantity(best.tiers, 1, best.moq) : null;
      const price100 = best ? priceAtQuantity(best.tiers, 100, best.moq) : null;
      return { pn, info: {
        unitPrice: best?.unitPrice ?? null,
        priceQuantity: proc.quantity,
        currency: proc.currency,
        priceUSD1: proc.currency === "USD" ? price1 : null,
        priceUSD100: proc.currency === "USD" ? price100 : null,
        stock: identityConflict ? "未知" : (offers.reduce((s, o) => s + (o.stock || 0), 0) > 0 ? "有货" : "缺货"),
        stockQty: identityConflict ? null : offers.reduce((s, o) => s + (o.stock || 0), 0),
        offers, channels: offers.map(o => o.vendor),
        lifecycle: identityConflict ? null : (offers.find(o => o.lifecycle)?.lifecycle || null),
        identityConflict,
        note: identityConflict ? "同一 MPN 的渠道厂商冲突，需指定厂商后重新查询"
          : best ? "" : (proc.inStockOnly ? `没有可满足 ${proc.quantity} 件数量的现货报价` : "没有适用的价格阶梯"),
        procurement: proc, source: identityConflict ? "distributor_conflict" : "distributor_api",
      }};
    });
    const stillMissing = [];
    settled.forEach((s, i) => {
      const pn = missing[i];
      if (s.status === "fulfilled" && s.value.info) {
        const ck = marketCacheKey(pn, procKey, expectedManufacturerFor(options, pn));
        cache.set(ck, s.value.info, TTL_REAL);
        result[pn] = s.value.info;
      } else stillMissing.push(pn);
    });
    missing.length = 0; missing.push(...stillMissing);
  }

  // Gemini 估算只能用于行情提示，生命周期等事实型接口必须显式关闭。
  if (missing.length && options.allowEstimate !== false) {
    try {
      const est = await geminiMarketEstimate(missing);
      for (const [pn, info] of Object.entries(est)) {
        const enriched = { ...info,
          priceUSD1: proc.currency === "USD" ? info.priceUSD1 : null,
          priceUSD100: proc.currency === "USD" ? info.priceUSD100 : null,
          procurement: proc, currency: proc.currency, priceQuantity: proc.quantity, unitPrice: null };
        const ck = marketCacheKey(pn, procKey, expectedManufacturerFor(options, pn));
        cache.set(ck, enriched, TTL_EST);
        result[pn] = enriched;
      }
    } catch (e) {
      console.warn("[market] 估算失败:", e.message);
      for (const pn of missing) result[pn] = { priceUSD1: null, priceUSD100: null, stock: "未知", offers: [], channels: [], note: "", source: "unavailable" };
    }
  }
  if (options.allowEstimate === false) {
    for (const pn of missing) if (!result[pn]) {
      result[pn] = { priceUSD1: null, priceUSD100: null, unitPrice: null, stock: "未知",
        stockQty: null, offers: [], channels: [], lifecycle: null,
        note: "没有精确 MPN 与厂商证据", source: "unavailable", procurement: proc };
    }
  }
  return { parts: result };
}

async function geminiMarketEstimate(pns) {
  const sys = `你是电子元器件市场行情分析师。估算下列型号的大致价格与供货。
只返回JSON：{"parts":[{"pn":"型号","priceUSD1":数字或null,"priceUSD100":数字或null,"stock":"充足|一般|紧张|停产风险|未知","channels":["渠道最多3个"],"note":"15字内备注"}]}
⚠ 估算参考：不确定填null/"未知"，严禁编造精确数字。全部${pns.length}个都要返回。`;
  // 空响应/解析失败也落入兜底（联网模式 thinking 吃预算可返回空文本而非抛错）
  let raw = null, data = null;
  try {
    raw = await callGemini(sys, `估算行情：\n${pns.join("\n")}\n（联网查最新价格）`, 4096, true);
    if (raw) data = repairJSON(raw);
  } catch { /* 落入兜底 */ }
  if (!data?.parts) {
    raw = await callGemini(sys, `估算行情：\n${pns.join("\n")}`, 4096, false);
    data = repairJSON(raw);
  }
  const out = {};
  for (const it of (data.parts || [])) {
    if (!it?.pn) continue;
    const matched = pns.find(p => p.toUpperCase() === String(it.pn).toUpperCase()) || it.pn;
    out[matched] = {
      priceUSD1: typeof it.priceUSD1 === "number" ? it.priceUSD1 : null,
      priceUSD100: typeof it.priceUSD100 === "number" ? it.priceUSD100 : null,
      stock: it.stock || "未知", stockQty: null, offers: [],
      channels: Array.isArray(it.channels) ? it.channels.slice(0, 3) : [],
      lifecycle: null, note: it.note || "", source: "ai_estimate",
    };
  }
  for (const pn of pns) if (!out[pn]) out[pn] = { priceUSD1: null, priceUSD100: null, stock: "未知", stockQty: null, offers: [], channels: [], lifecycle: null, note: "", source: "ai_estimate" };
  return out;
}

module.exports = {
  getMarketInfo, priceAtQuantity, packagingMatches, manufacturerMatches,
  marketCacheKey, buildManufacturerHints, digikeySearch, mouserSearch,
};
