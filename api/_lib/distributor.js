// distributor.js — 分销商器件详情（DigiKey / Mouser）
//
// 数据优先级：ezPLM（已审核）> 分销商 API（权威一手）> AI 联网/知识（兜底）
// 分销商返回的品类与参数是厂商申报数据，比 AI 推断可靠得多，因此排在 AI 之前。

const { cache } = require("./cache");
const TTL = 7 * 86400;

/* ── DigiKey OAuth ── */
let dkToken = null, dkExp = 0;
async function digikeyToken() {
  const id = process.env.DIGIKEY_CLIENT_ID, secret = process.env.DIGIKEY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (dkToken && Date.now() < dkExp) return dkToken;
  try {
    const r = await fetch("https://api.digikey.com/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    dkToken = j.access_token; dkExp = Date.now() + (j.expires_in - 60) * 1000;
    return dkToken;
  } catch (e) { console.warn("[distributor] DigiKey token:", e.message); return null; }
}

/** DigiKey 器件详情 → 标准结构 */
async function digikeyPart(pn) {
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
      body: JSON.stringify({ Keywords: pn, Limit: 3 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const norm = x => String(x).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const target = norm(pn);
    const list = j?.Products || [];
    const p = list.find(x => norm(x.ManufacturerProductNumber || "") === target)
           || list.find(x => norm(x.ManufacturerProductNumber || "").startsWith(target))
           || list[0];
    if (!p) return null;

    const parameters = [];
    let i = 0;
    for (const a of (p.Parameters || [])) {
      const name = a?.ParameterText || a?.Parameter, value = a?.ValueText || a?.Value;
      if (!name || !value || /^-$/.test(String(value).trim())) continue;
      parameters.push({
        id: `param_${++i}`, name, nameEn: name, value: String(value), unit: "",
        source: "digikey", sourceLabel: "DigiKey", confidence: "high", verified: true,
      });
    }
    const pkg = (p.Parameters || []).find(a => /package\s*\/?\s*case|supplier device package/i.test(a?.ParameterText || ""))?.ValueText;
    return {
      partNumber: p.ManufacturerProductNumber || pn,
      manufacturer: p.Manufacturer?.Name || "",
      category: [p.Category?.Name, p.Category?.ChildCategories?.[0]?.Name].filter(Boolean).join(" / ")
             || p.Category?.Name || "",
      description: p.Description?.ProductDescription || p.Description?.DetailedDescription || "",
      parameters, footprint: pkg || "",
      datasheetUrl: p.DatasheetUrl || "",
      productUrl: p.ProductUrl || "",
      _source: "digikey",
    };
  } catch (e) { console.warn("[distributor] DigiKey search:", e.message); return null; }
}

/** Mouser 器件详情 → 标准结构 */
async function mouserPart(pn) {
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
    const parameters = [];
    let i = 0;
    for (const a of (p.ProductAttributes || [])) {
      const name = a?.AttributeName, value = a?.AttributeValue;
      if (!name || !value) continue;
      parameters.push({
        id: `param_${++i}`, name, nameEn: name, value: String(value), unit: "",
        source: "mouser", sourceLabel: "Mouser", confidence: "high", verified: true,
      });
    }
    return {
      partNumber: p.ManufacturerPartNumber || pn,
      manufacturer: p.Manufacturer || "",
      category: p.Category || "",
      description: p.Description || "",
      parameters,
      footprint: (p.ProductAttributes || []).find(a => /package|case/i.test(a?.AttributeName || ""))?.AttributeValue || "",
      datasheetUrl: p.DataSheetUrl || "",
      productUrl: p.ProductDetailUrl || "",
      _source: "mouser",
    };
  } catch (e) { console.warn("[distributor] Mouser search:", e.message); return null; }
}

/**
 * 查询分销商器件详情。DigiKey 优先（参数结构更规整），Mouser 兜底；
 * 两者都有时合并参数（以 DigiKey 为主，Mouser 补充缺失项）。
 */
async function getDistributorPart(partNumber) {
  if (!process.env.DIGIKEY_CLIENT_ID && !process.env.MOUSER_API_KEY) return null;
  const ck = `dist:${partNumber.toLowerCase()}`;
  const hit = cache.get(ck);
  if (hit !== null && hit !== undefined) return hit || null;

  const [dk, mo] = await Promise.all([digikeyPart(partNumber), mouserPart(partNumber)]);
  let out = dk || mo;
  if (dk && mo) {
    const has = n => dk.parameters.some(p => p.name.toLowerCase() === String(n).toLowerCase());
    let idx = dk.parameters.length;
    for (const p of mo.parameters) if (!has(p.name)) dk.parameters.push({ ...p, id: `param_${++idx}` });
    out = { ...dk, _source: "digikey+mouser", datasheetUrl: dk.datasheetUrl || mo.datasheetUrl };
  }
  cache.set(ck, out || false, TTL);
  return out;
}

module.exports = { getDistributorPart, digikeyPart, mouserPart };
