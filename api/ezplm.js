/**
 * api/ezplm.js — ezPLM 官方 API 签名代理（HMAC-SHA256）
 *
 * 为什么要代理：ezPLM 用 API Key 做身份+签名密钥，绝不能放前端。
 * 本函数在服务端持有 EZPLM_API_KEY（Vercel → Settings → Environment Variables），
 * 完成签名后转发，同时规避 CORS。
 *
 * 签名规则：
 *   canonical = METHOD \n PATH \n 字典序query \n X-Timestamp \n X-Nonce
 *   X-Signature = base64url( HMAC-SHA256( API_KEY, canonical ) )
 *
 * 调用：
 *   GET /api/ezplm?path=status                          → { configured }（不耗上游配额）
 *   GET /api/ezplm?path=parts&keyword=TPS62160&pageSize=20
 *   GET /api/ezplm?path=reference-designs&partlibId=xxx
 */
const crypto = require("node:crypto");

const BASE_URL = "https://www.ezplm.cn";
const ALLOWED_PATHS = new Set(["parts", "reference-designs"]);

/** query 规范化：过滤空值 → 字典序 → encodeURIComponent 拼接 */
function canonicalQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
    .map(([k, v]) => [String(k), String(Array.isArray(v) ? v[0] : v)])
    .sort(([lk, lv], [rk, rv]) => (lk === rk ? lv.localeCompare(rv) : lk.localeCompare(rk)))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function buildSignature({ apiKey, method, path, params, timestamp, nonce }) {
  const canonical = [method.toUpperCase(), path, canonicalQuery(params), timestamp, nonce].join("\n");
  return crypto.createHmac("sha256", apiKey).update(canonical).digest("base64url");
}

/** 供其它服务端模块直接调用（不走 HTTP） */
async function callEzplm(path, params = {}) {
  const apiKey = process.env.EZPLM_API_KEY;
  if (!apiKey) return { ok: false, configured: false, data: [] };
  if (!ALLOWED_PATHS.has(path)) return { ok: false, error: "invalid path", data: [] };

  const apiPath = `/api/v1/api-key/${path}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const signature = buildSignature({ apiKey, method: "GET", path: apiPath, params, timestamp, nonce });
  const query = canonicalQuery(params);
  const url = query ? `${BASE_URL}${apiPath}?${query}` : `${BASE_URL}${apiPath}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": apiKey, "X-Timestamp": timestamp, "X-Nonce": nonce, "X-Signature": signature },
      signal: AbortSignal.timeout(12000),
    });
    const text = await upstream.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!upstream.ok) return { ok: false, status: upstream.status, error: json?.message || text.slice(0, 200), data: [] };
    const data = Array.isArray(json?.data) ? json.data : Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
    return { ok: true, configured: true, data, raw: json };
  } catch (e) {
    console.warn("[ezplm] upstream failed:", e.message);
    return { ok: false, error: e.message, data: [] };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { path, ...params } = req.query || {};
  const apiKey = process.env.EZPLM_API_KEY;

  if (path === "status") return res.status(200).send(JSON.stringify({ configured: !!apiKey }));
  if (!apiKey) return res.status(501).send(JSON.stringify({ error: "EZPLM_API_KEY 未配置", hint: "Vercel → Settings → Environment Variables 添加 EZPLM_API_KEY 后 Redeploy" }));
  if (!ALLOWED_PATHS.has(path)) return res.status(400).send(JSON.stringify({ error: "invalid path", allowed: [...ALLOWED_PATHS, "status"] }));

  const r = await callEzplm(path, params);
  res.status(r.ok ? 200 : (r.status || 502)).send(JSON.stringify(r.ok ? (r.raw ?? { data: r.data }) : { error: r.error }));
};

module.exports.callEzplm = callEzplm;
module.exports.canonicalQuery = canonicalQuery;
module.exports.buildSignature = buildSignature;
