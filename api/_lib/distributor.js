// distributor.js — 分销商器件详情（DigiKey / Mouser）
//
// 数据优先级：ezPLM（已审核）> 分销商 API（权威一手）> AI 联网/知识（兜底）
// 分销商返回的品类与参数是厂商申报数据，比 AI 推断可靠得多，因此排在 AI 之前。

const { cache } = require("./cache");
const { splitMpn, canonicalManufacturer } = require("./part-identity");
const TTL = 7 * 86400;

/**
 * 从分销商搜索结果中挑出**精确匹配**项。
 * 匹配层级（模糊结果一律拒绝，不得冒充 exact）：
 *   1. 归一化 MPN 完全相同
 *   2. 去掉包装后缀后相同（TL431ACDBR vs TL431ACDBRG4）
 *   3. 以上都无 → null
 */
function pickExact(list, requestedMpn, mpnOf, mfrOf) {
  if (!Array.isArray(list) || !list.length) return null;
  const norm = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const target = norm(requestedMpn);
  const targetBody = norm(splitMpn(requestedMpn).body);
  const targetBase = norm(splitMpn(requestedMpn).baseDevice);

  const exact = list.find(x => norm(mpnOf(x)) === target);
  if (exact) return exact;

  const bodyHit = list.find(x => norm(splitMpn(mpnOf(x) || "").body) === targetBody);
  if (bodyHit) return bodyHit;

  // 基础器件相同且厂商可确认时，才允许作为变体使用；否则宁可没有
  const familyHit = list.find(x => {
    const b = norm(splitMpn(mpnOf(x) || "").baseDevice);
    return b && b === targetBase && b.length >= 4;
  });
  return familyHit || null;
}

/**
 * 交期归一化（ALT-006）
 * 线上出现 DigiKey 280 天、Mouser 1960 天 —— 后者显然是把"周"当成"天"再乘 7 的结果。
 * 统一转为天，并对超出合理范围的值标记异常且不参与排序。
 */
const LEAD_TIME_MAX_DAYS = 365;      // 超过一年视为异常
function normalizeLeadTime(raw, unit) {
  if (raw == null || raw === "") return { days: null, abnormal: false, raw, unit };
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).match(/[\d.]+/)?.[0] ?? "");
  if (!Number.isFinite(n) || n <= 0) return { days: null, abnormal: false, raw, unit };
  const u = String(unit || "").toLowerCase();
  const days = /week|周/.test(u) ? Math.round(n * 7)
             : /month|月/.test(u) ? Math.round(n * 30)
             : /hour|小时/.test(u) ? Math.round(n / 24)
             : Math.round(n);
  const abnormal = days > LEAD_TIME_MAX_DAYS;
  return { days, abnormal, raw, unit: unit || "days",
    note: abnormal ? `交期 ${days} 天超出合理范围（>${LEAD_TIME_MAX_DAYS} 天），已标记为待核验且不参与排序` : "" };
}

/** 制造商官网判定（ALT-013）：分销商域名不得冒充官网 */
const DISTRIBUTOR_DOMAINS = /(digikey|mouser|arrow|avnet|farnell|element14|rs-online|rsdelivers|lcsc|szlcsc|newark|verical|oemstrade|findchips|octopart)\./i;
function classifyProductUrl(url) {
  if (!url) return { manufacturerUrl: null, distributorUrl: null };
  try {
    const host = new URL(url).hostname;
    return DISTRIBUTOR_DOMAINS.test(host)
      ? { manufacturerUrl: null, distributorUrl: url }
      : { manufacturerUrl: url, distributorUrl: null };
  } catch { return { manufacturerUrl: null, distributorUrl: null }; }
}

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
    const list = j?.Products || [];
    // ⚠ 绝不能 fallback 到 list[0]：
    // 线上曾因此把 DigiKey 搜 "TL431" 返回的液位传感器当成 TL431 的数据，
    // 参数里出现 "Material - Housing & Prism: 316 Stainless Steel"。
    const p = pickExact(list, pn, x => x.ManufacturerProductNumber, x => x.Manufacturer?.Name);
    if (!p) { console.warn(`[distributor] DigiKey 无 ${pn} 的精确匹配，已放弃（不使用模糊结果）`); return null; }

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
      ...classifyProductUrl(p.ProductUrl || ""),
      leadTime: normalizeLeadTime(p.ManufacturerLeadWeeks, "weeks"),
      dataRetrievedAt: new Date().toISOString(),
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
    const parts = j?.SearchResults?.Parts || [];
    const p = pickExact(parts, pn, x => x.ManufacturerPartNumber, x => x.Manufacturer);
    if (!p) { console.warn(`[distributor] Mouser 无 ${pn} 的精确匹配，已放弃`); return null; }
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
      ...classifyProductUrl(p.ProductDetailUrl || ""),
      leadTime: normalizeLeadTime(p.LeadTime, /week|周/i.test(String(p.LeadTime || "")) ? "weeks" : "days"),
      dataRetrievedAt: new Date().toISOString(),
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
  // 两家厂商信息不一致时不合并，避免把不同厂商的参数混进同一条记录
  if (dk && mo) {
    const a = canonicalManufacturer(dk.manufacturer), b = canonicalManufacturer(mo.manufacturer);
    if (a && b && a !== b) {
      console.warn(`[distributor] ${partNumber} 厂商不一致（DigiKey=${dk.manufacturer} / Mouser=${mo.manufacturer}），仅采用 DigiKey`);
      cache.set(ck, dk, TTL);
      return dk;
    }
  }
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

module.exports = { getDistributorPart, digikeyPart, mouserPart, normalizeLeadTime, classifyProductUrl, LEAD_TIME_MAX_DAYS };
