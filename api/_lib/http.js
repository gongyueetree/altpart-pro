// http.js — 统一 API 错误语义与响应格式
// 修复：此前内部失败也返回 HTTP 200，调用方无法区分成功与失败。

const CODES = {
  BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413, RATE_LIMITED: 429,
  INTERNAL: 500, UPSTREAM_ERROR: 502, UPSTREAM_TIMEOUT: 504,
};

function requestId() {
  return "req_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fail(res, code, message, extra = {}) {
  const status = CODES[code] || 500;
  const body = { success: false, error: { code, message, requestId: extra.requestId || requestId() } };
  if (extra.details) body.error.details = extra.details;
  res.status(status).json(body);
  return body;
}

function ok(res, payload = {}) {
  res.status(200).json({ success: true, ...payload });
}

/** 把上游异常映射为合适的状态码 */
function classifyUpstream(err) {
  const m = String(err?.message || "");
  if (err?.name === "TimeoutError" || /timeout|超时|aborted/i.test(m)) return "UPSTREAM_TIMEOUT";
  if (/429|rate.?limit|限流/i.test(m)) return "RATE_LIMITED";
  if (/40[13]|unauthor|forbidden/i.test(m)) return "UPSTREAM_ERROR";
  if (/5\d\d|upstream|bad gateway/i.test(m)) return "UPSTREAM_ERROR";
  return "INTERNAL";
}

module.exports = { CODES, fail, ok, requestId, classifyUpstream };
