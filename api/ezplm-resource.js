/**
 * api/ezplm-resource.js — ezPLM 资源代理
 *
 * 为什么需要：ezPLM 返回的文件 URL（七牛云）带时效签名且跨域，
 * 浏览器直接 fetch 会 CORS 失败；签名几小时后过期。
 * 通过本代理同源获取，同时把上游错误暴露出来而不是静默失败。
 *
 * 用法: /api/ezplm-resource?url=<encodeURIComponent(原始URL)>
 */
const ALLOWED_HOSTS = new Set([
  "qn.ezplm.com",
  "www.ezplm.cn",
  "ezplm.cn",
  "raw.githubusercontent.com",   // KiCad 官方库（内置示例用）
]);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const raw = req.query?.url;
  if (!raw) {
    res.status(400).json({ error: "缺少 url 参数" });
    return;
  }

  let target;
  try { target = new URL(String(raw)); }
  catch { res.status(400).json({ error: "url 格式不合法" }); return; }

  if (!/^https?:$/.test(target.protocol)) {
    res.status(400).json({ error: "仅支持 http/https" });
    return;
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    res.status(403).json({ error: `不允许的主机: ${target.hostname}` });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      res.status(upstream.status).json({
        error: `资源获取失败 (${upstream.status})`,
        detail: detail.slice(0, 300),
        hint: upstream.status === 401 || upstream.status === 403
          ? "签名 URL 可能已过期，请重新查询该器件以获取新链接"
          : undefined,
      });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const ct = upstream.headers.get("content-type") || guessType(target.pathname);
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=3600");
    const name = target.pathname.split("/").pop();
    if (/\.(kicad_mod|kicad_sym|step|stp|wrl|lib)$/i.test(name || "")) {
      res.setHeader("Content-Disposition", `inline; filename="${name}"`);
    }
    res.status(200).send(buf);
  } catch (e) {
    console.warn("[ezplm-resource]", e.message);
    res.status(502).json({ error: e.name === "TimeoutError" ? "上游超时" : e.message });
  }
};

function guessType(pathname) {
  if (/\.(kicad_mod|kicad_sym|lib|wrl)$/i.test(pathname)) return "text/plain; charset=utf-8";
  if (/\.pdf$/i.test(pathname)) return "application/pdf";
  if (/\.(step|stp)$/i.test(pathname)) return "application/octet-stream";
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(pathname)) return "image/*";
  return "application/octet-stream";
}
