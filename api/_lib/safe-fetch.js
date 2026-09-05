// safe-fetch.js — 用户可控 URL 的 SSRF 防护、逐跳重定向校验与限长读取。

const dns = require("node:dns").promises;
const net = require("node:net");

function isPrivateIpv4(address) {
  const parts = String(address).split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113);
}

function isPrivateIp(address) {
  const value = String(address || "").toLowerCase().split("%")[0].replace(/^\[|\]$/g, "");
  if (net.isIP(value) === 4) return isPrivateIpv4(value);
  if (net.isIP(value) !== 6) return false;
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff")) return true;
  if (/^(?:100:|2001:2:|2001:db8:)/.test(value)) return true;
  const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPrivateIpv4(mapped);
  const mappedHex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return false;
}

async function validateRemoteUrl(input, options = {}) {
  let url;
  try { url = input instanceof URL ? new URL(input.toString()) : new URL(String(input)); }
  catch { throw new Error("URL 格式不合法"); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("仅支持 http/https URL");
  if (url.username || url.password) throw new Error("URL 不允许包含用户凭据");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("URL 不允许访问非标准端口");
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal")
    throw new Error("URL 指向本机或云元数据地址");
  if (options.allowedHost && !options.allowedHost(host)) throw new Error(`不允许的主机: ${host}`);
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("URL 指向私网或保留地址");
  } else if (options.resolveDns !== false) {
    let rows;
    try { rows = await (options.lookup || dns.lookup)(host, { all: true, verbatim: true }); }
    catch { throw new Error("URL 主机无法解析"); }
    if (!rows?.length || rows.some(r => isPrivateIp(r.address)))
      throw new Error("URL 主机解析到私网或保留地址");
  }
  return url;
}

async function fetchWithSafeRedirects(input, options = {}) {
  const maxRedirects = Math.max(0, Math.min(Number(options.maxRedirects ?? 3), 5));
  let current = await validateRemoteUrl(input, options);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await (options.fetchImpl || fetch)(current.toString(), {
      ...options.fetchOptions,
      redirect: "manual",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current, redirects: hop };
    if (hop === maxRedirects) throw new Error("重定向次数过多");
    const location = response.headers.get("location");
    if (!location) throw new Error("上游返回无 Location 的重定向");
    current = await validateRemoteUrl(new URL(location, current), options);
  }
  throw new Error("重定向次数过多");
}

async function readResponseBuffer(response, maxBytes) {
  const limit = Math.max(1, Number(maxBytes) || 1);
  const length = Number(response.headers.get("content-length") || 0);
  if (length && length > limit) throw new Error(`响应超过 ${(limit / 1048576).toFixed(0)}MB 限制`);
  if (!response.body?.getReader) {
    const fallback = Buffer.from(await response.arrayBuffer());
    if (fallback.byteLength > limit) throw new Error("响应体过大");
    return fallback;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("响应体过大"); }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, size);
}

module.exports = { isPrivateIp, validateRemoteUrl, fetchWithSafeRedirects, readResponseBuffer };
