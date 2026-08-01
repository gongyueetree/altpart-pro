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
    if (!upstream.ok) {
      return { ok: false, kind: "upstream_status", status: upstream.status,
        error: json?.message || json?.msg || text.slice(0, 300),
        upstreamBody: text.slice(0, 500), data: [] };
    }
    const data = Array.isArray(json?.data) ? json.data : Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
    return { ok: true, configured: true, data, raw: json };
  } catch (e) {
    const kind = e?.name === "TimeoutError" || /abort|timeout/i.test(e?.message || "")
      ? "network_timeout" : "network_error";
    console.warn(`[ezplm] ${kind}:`, e.message);
    return { ok: false, kind, error: e.message, data: [] };
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
  if (r.ok) return res.status(200).send(JSON.stringify(r.raw ?? { data: r.data }));

  // 上游失败时保留可诊断信息，避免"502 但不知道为什么"
  const status = r.kind === "network_timeout" ? 504 : (r.status || 502);
  const hint = {
    upstream_status: r.status === 401 || r.status === 403
      ? "签名或 API Key 校验失败：请确认 EZPLM_API_KEY 正确，且服务器时钟与上游相差不超过允许窗口"
      : r.status === 404 ? "上游路径不存在，可能 API 版本已变更"
      : r.status === 429 ? "上游限流，请降低调用频率"
      : "上游返回错误状态",
    network_timeout: "连接 ezPLM 超时（Serverless 出网或上游响应慢）",
    network_error: "无法连接 ezPLM（DNS/网络/TLS 失败）",
  }[r.kind] || "未知失败";

  res.status(status).send(JSON.stringify({
    error: r.error || "ezPLM 调用失败",
    kind: r.kind, upstreamStatus: r.status ?? null,
    upstreamBody: r.upstreamBody ?? null,
    hint,
    debug: { path, params, timestampUsed: Math.floor(Date.now() / 1000) },
  }));
};

module.exports.callEzplm = callEzplm;
module.exports.canonicalQuery = canonicalQuery;
module.exports.buildSignature = buildSignature;
