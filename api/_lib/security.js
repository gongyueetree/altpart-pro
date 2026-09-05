// security.js — 可选 API Key 鉴权 + 单实例限流。
// 多实例生产限流仍应接 Redis；此层负责默认止损与统一响应。

const crypto = require("node:crypto");
const buckets = new Map();

function configuredKeys() {
  return String(process.env.ALTPART_API_KEYS || "").split(",").map(x => x.trim()).filter(Boolean);
}

function secureEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function suppliedKey(req) {
  const direct = req.headers?.["x-api-key"];
  const auth = String(req.headers?.authorization || "");
  return String(direct || (/^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : ""));
}

function clientAddress(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "";
}

function positiveNumber(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function guardApi(req, res, { cost = 1 } = {}) {
  const keys = configuredKeys();
  if (String(process.env.ALTPART_REQUIRE_AUTH || "").toLowerCase() === "true") {
    const got = suppliedKey(req);
    if (!got || !keys.some(key => secureEqual(got, key))) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "需要有效的 AltPart API Key" } });
      return false;
    }
  }

  const address = clientAddress(req);
  if (!address) return true; // 纯单元测试/内部直接调用没有网络身份，不计入公网配额。
  const windowMs = positiveNumber(process.env.ALTPART_RATE_WINDOW_SECONDS, 60, 10) * 1000;
  const limit = positiveNumber(process.env.ALTPART_RATE_LIMIT, 60);
  const now = Date.now();
  const key = suppliedKey(req) || address;
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) bucket = { used: 0, resetAt: now + windowMs };
  bucket.used += Math.max(1, Number(cost) || 1);
  buckets.set(key, bucket);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  // 极端来源地址洪泛下仍给 Map 一个硬上限；Map 保持插入顺序，先逐出最旧 bucket。
  while (buckets.size > 10000) buckets.delete(buckets.keys().next().value);
  if (bucket.used > limit) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后重试" } });
    return false;
  }
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - bucket.used)));
  return true;
}

function guardAdmin(req, res) {
  const keys = String(process.env.ALTPART_ADMIN_API_KEYS || "")
    .split(",").map(x => x.trim()).filter(Boolean);
  const got = suppliedKey(req);
  if (!keys.length || !got || !keys.some(key => secureEqual(got, key))) {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "该接口仅限管理员访问" } });
    return false;
  }
  return true;
}

module.exports = { guardApi, guardAdmin, clientAddress, suppliedKey, positiveNumber, _buckets: buckets };
