// market.js — 实时价格/库存
// 优先级: DigiKey API → Mouser API → Gemini估算(标注仅供参考)
// 未配置分销商 Key 时自动走 Gemini 兜底，接入后自动切换真实数据

const { callGemini, repairJSON } = require("./gemini");
const { cache } = require("./cache");

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

async function digikeySearch(pn) {
  const token = await digikeyToken();
  if (!token) return null;
  try {
    const r = await fetch("https://api.digikey.com/products/v4/search/keyword", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-DIGIKEY-Client-Id": process.env.DIGIKEY_CLIENT_ID,
        "X-DIGIKEY-Locale-Site": process.env.DIGIKEY_SITE || "US",
        "X-DIGIKEY-Locale-Currency": "USD",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Keywords: pn, Limit: 1 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.Products?.[0];
    if (!p) return null;
    return {
      vendor: "DigiKey",
      stock: p.QuantityAvailable ?? null,
      moq: p.MinimumOrderQuantity ?? 1,
      tiers: (p.StandardPricing || p.ProductVariations?.[0]?.StandardPricing || [])
        .slice(0, 4).map(t => ({ qty: t.BreakQuantity, price: t.UnitPrice })),
      url: p.ProductUrl || p.DigiKeyProductNumber ? p.ProductUrl : undefined,
      leadTimeDays: p.ManufacturerLeadWeeks ? parseInt(p.ManufacturerLeadWeeks) * 7 : null,
      lifecycle: p.ProductStatus?.Status || null,
    };
  } catch (e) { console.warn("[digikey] search失败:", e.message); return null; }
}

/* ══════════ Mouser ══════════ */
async function mouserSearch(pn) {
  const key = process.env.MOUSER_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.mouser.com/api/v1/search/partnumber?apiKey=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: pn, partSearchOptions: "Exact" } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.SearchResults?.Parts?.[0];
    if (!p) return null;
    const num = s => { const m = String(s || "").match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
    return {
      vendor: "Mouser",
      stock: num(p.AvailabilityInStock) ?? null,
      moq: num(p.Min) ?? 1,
      tiers: (p.PriceBreaks || []).slice(0, 4).map(t => ({ qty: t.Quantity, price: num(t.Price) })),
      url: p.ProductDetailUrl,
      leadTimeDays: num(p.LeadTime) ? num(p.LeadTime) * 7 : null,
      lifecycle: p.LifecycleStatus || null,
    };
  } catch (e) { console.warn("[mouser] search失败:", e.message); return null; }
}

/* ══════════ 统一入口 ══════════ */
async function getMarketInfo(partNumbers) {
  const pns = [...new Set(partNumbers.map(p => String(p).trim()).filter(Boolean))].slice(0, 8);
  const result = {};
  const missing = [];

  for (const pn of pns) {
    const hit = cache.get(`market:${pn.toLowerCase()}`);
    if (hit) result[pn] = hit; else missing.push(pn);
  }
  if (!missing.length) return { parts: result };

  const hasDistributor = !!(process.env.DIGIKEY_CLIENT_ID || process.env.MOUSER_API_KEY);

  if (hasDistributor) {
    const settled = await Promise.allSettled(missing.map(async pn => {
      const [dk, mo] = await Promise.all([digikeySearch(pn), mouserSearch(pn)]);
      const offers = [dk, mo].filter(Boolean);
      if (!offers.length) return { pn, info: null };
      const best = offers.filter(o => o.tiers?.length).sort((a, b) => (a.tiers[0].price ?? 9e9) - (b.tiers[0].price ?? 9e9))[0];
      return { pn, info: {
        priceUSD1: best?.tiers?.[0]?.price ?? null,
        priceUSD100: best?.tiers?.find(t => t.qty >= 100)?.price ?? null,
        stock: offers.reduce((s, o) => s + (o.stock || 0), 0) > 0 ? "有货" : "缺货",
        stockQty: offers.reduce((s, o) => s + (o.stock || 0), 0),
        offers, channels: offers.map(o => o.vendor),
        lifecycle: offers.find(o => o.lifecycle)?.lifecycle || null,
        note: "", source: "distributor_api",
      }};
    }));
    const stillMissing = [];
    settled.forEach((s, i) => {
      const pn = missing[i];
      if (s.status === "fulfilled" && s.value.info) {
        cache.set(`market:${pn.toLowerCase()}`, s.value.info, TTL_REAL);
        result[pn] = s.value.info;
      } else stillMissing.push(pn);
    });
    missing.length = 0; missing.push(...stillMissing);
  }

  // Gemini 估算兜底
  if (missing.length) {
    try {
      const est = await geminiMarketEstimate(missing);
      for (const [pn, info] of Object.entries(est)) {
        cache.set(`market:${pn.toLowerCase()}`, info, TTL_EST);
        result[pn] = info;
      }
    } catch (e) {
      console.warn("[market] 估算失败:", e.message);
      for (const pn of missing) result[pn] = { priceUSD1: null, priceUSD100: null, stock: "未知", offers: [], channels: [], note: "", source: "unavailable" };
    }
  }
  return { parts: result };
}

async function geminiMarketEstimate(pns) {
  const sys = `你是电子元器件市场行情分析师。估算下列型号的大致价格与供货。
只返回JSON：{"parts":[{"pn":"型号","priceUSD1":数字或null,"priceUSD100":数字或null,"stock":"充足|一般|紧张|停产风险|未知","channels":["渠道最多3个"],"note":"15字内备注"}]}
⚠ 估算参考：不确定填null/"未知"，严禁编造精确数字。全部${pns.length}个都要返回。`;
  let raw;
  try { raw = await callGemini(sys, `估算行情：\n${pns.join("\n")}\n（联网查最新价格）`, 4096, true); }
  catch { raw = await callGemini(sys, `估算行情：\n${pns.join("\n")}`, 4096, false); }
  const data = repairJSON(raw);
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

module.exports = { getMarketInfo };
