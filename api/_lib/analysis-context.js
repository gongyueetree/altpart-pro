// analysis-context.js — 无状态、短期有效的分析上下文签名。
// 客户端可以读取 payload，但不能修改原器件参数后要求服务端据此评分。

const crypto = require("node:crypto");
const MAX_AGE_SECONDS = 15 * 60;
const MAX_TOKEN_BYTES = 64 * 1024;

function secret() {
  const value = String(process.env.ANALYSIS_CONTEXT_SECRET || "");
  if (value) return Buffer.byteLength(value) >= 32 ? value : null;
  // Existing deployments already have a private provider credential. Derive a
  // domain-separated signing key rather than re-querying mutable AI enrichment.
  const provider = [process.env.EZPLM_API_KEY, process.env.GEMINI_API_KEY]
    .find(key => Buffer.byteLength(String(key || "")) >= 32);
  return provider ? crypto.createHmac("sha256", provider)
    .update("partbridge:analysis-context:signing:v1").digest("hex") : null;
}

const text = (value, max) => String(value ?? "").slice(0, max);
function safeValue(value, max = 500) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, max);
  try { return JSON.stringify(value).slice(0, max); }
  catch { return ""; }
}

function safeOriginal(original) {
  if (!original || typeof original !== "object") return null;
  const parameters = (Array.isArray(original.parameters) ? original.parameters : [])
    .slice(0, 30).map(p => ({
      id: text(p?.id, 80),
      name: text(p?.name, 160),
      nameEn: text(p?.nameEn, 160),
      value: safeValue(p?.value),
      unit: text(p?.unit, 40),
      source: text(p?.source, 40),
      sourceLabel: text(p?.sourceLabel, 80),
      confidence: text(p?.confidence, 20),
      verified: p?.verified === true,
    }));
  const pins = (Array.isArray(original.pins) ? original.pins : []).slice(0, 512).map(p => ({
    number: text(p?.number ?? p?.pin ?? p?.pad, 32),
    name: text(p?.name ?? p?.function ?? p?.signal, 120),
    role: text(p?.role ?? p?.standardFunction, 80),
    type: text(p?.type ?? p?.electricalType, 60),
  })).filter(p => p.number && p.name);
  return {
    partNumber: text(original.partNumber, 160),
    requestedMpn: text(original.requestedMpn, 160),
    manufacturer: text(original.manufacturer, 160),
    category: text(original.category, 160),
    description: text(original.description, 1000),
    footprint: text(original.footprint, 240),
    parameters,
    pins: pins.length ? pins : undefined,
    pinEvidence: original.pinEvidence ? {
      source: text(original.pinEvidence.source, 60),
      url: text(original.pinEvidence.url, 2000),
      documentHash: text(original.pinEvidence.documentHash, 160),
      verifiedAt: text(original.pinEvidence.verifiedAt, 80),
    } : undefined,
    identity: original.identity ? {
      requestedMpn: text(original.identity.requestedMpn, 160),
      exactMpn: text(original.identity.exactMpn, 160),
      manufacturerName: text(original.identity.manufacturerName, 160),
      matchType: text(original.identity.matchType, 40),
    } : undefined,
    approved: original.approved === true,
    _source: text(original._source, 40),
    _dataPath: text(original._dataPath, 40),
    _matchType: text(original._matchType, 40),
  };
}

function signAnalysisContext(original, requestedPartNumber) {
  const key = secret();
  if (!key) return null;
  const payload = {
    v: 1,
    iat: Math.floor(Date.now() / 1000),
    requestedPartNumber: String(requestedPartNumber || original?.partNumber || ""),
    original: safeOriginal(original),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", key).update(body).digest("base64url");
  const token = `${body}.${sig}`;
  return Buffer.byteLength(token) <= MAX_TOKEN_BYTES ? token : null;
}

function sameMpn(a, b) {
  const norm = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return !!norm(a) && norm(a) === norm(b);
}

function verifyAnalysisContext(token, requestedPartNumber, nowSeconds = Math.floor(Date.now() / 1000)) {
  const key = secret();
  if (!key) return { valid: false, code: "not_configured", message: "服务端未配置分析上下文签名密钥" };
  if (typeof token !== "string" || !token || Buffer.byteLength(token) > MAX_TOKEN_BYTES)
    return { valid: false, code: "malformed", message: "分析上下文格式不合法" };
  const [body, supplied, extra] = token.split(".");
  if (!body || !supplied || extra)
    return { valid: false, code: "malformed", message: "分析上下文格式不合法" };
  const expected = crypto.createHmac("sha256", key).update(body).digest("base64url");
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { valid: false, code: "bad_signature", message: "分析上下文签名无效，请重新分析器件" };
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { return { valid: false, code: "malformed", message: "分析上下文无法解析" }; }
  if (payload?.v !== 1 || !payload.original?.parameters?.length)
    return { valid: false, code: "malformed", message: "分析上下文内容不完整" };
  if (!Number.isFinite(payload.iat) || payload.iat > nowSeconds + 60 || nowSeconds - payload.iat > MAX_AGE_SECONDS)
    return { valid: false, code: "expired", message: "分析上下文已过期，请重新分析器件" };
  if (!sameMpn(payload.requestedPartNumber, requestedPartNumber) || !sameMpn(payload.original.partNumber, requestedPartNumber))
    return { valid: false, code: "part_mismatch", message: "分析上下文与当前器件型号不一致，请重新分析" };
  return { valid: true, original: payload.original, issuedAt: payload.iat };
}

module.exports = { signingConfigured: () => !!secret(), signAnalysisContext, verifyAnalysisContext, safeOriginal, MAX_AGE_SECONDS };
