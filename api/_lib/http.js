// http.js — 统一 API 错误语义与响应格式
// 修复：此前内部失败也返回 HTTP 200，调用方无法区分成功与失败。

/** 业务错误码 → HTTP status；错误必须可解释、可重试判定 */
const BIZ = {
  INVALID_REQUEST:       { status: 400, retryable: false },
  PART_NOT_FOUND:        { status: 404, retryable: false },
  PART_UNVERIFIED:       { status: 422, retryable: false },
  VARIANT_NOT_RESOLVED:  { status: 422, retryable: false },
  NO_VERIFIED_CANDIDATES:{ status: 200, retryable: false },  // 业务上是"有结论"，非系统失败
  PIN_EVIDENCE_MISSING:  { status: 200, retryable: false },
  AI_INVALID_RESPONSE:   { status: 502, retryable: true },
  UPSTREAM_TIMEOUT:      { status: 504, retryable: true },
  UPSTREAM_UNAVAILABLE:  { status: 502, retryable: true },
  RATE_LIMITED:          { status: 429, retryable: true },
  INTERNAL_ERROR:        { status: 500, retryable: true },
};

/** 业务失败响应：带 code / stage / retryable，前端据此给出可读提示 */
function bizFail(res, code, message, extra = {}) {
  const spec = BIZ[code] || BIZ.INTERNAL_ERROR;
  const body = {
    success: false,
    error: {
      code, message,
      requestId: extra.requestId || requestId(),
      retryable: extra.retryable ?? spec.retryable,
      stage: extra.stage || null,
    },
  };
  if (extra.details) body.error.details = extra.details;
  if (extra.diagnostics) body.diagnostics = extra.diagnostics;
  res.status(spec.status).json(body);
  return body;
}

const CODES = {
  BAD_REQUEST: 400, NOT_FOUND_PART: 404, UNPROCESSABLE: 422, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
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

module.exports = { CODES, BIZ, fail, bizFail, ok, requestId, classifyUpstream };
