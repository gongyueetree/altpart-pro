/**
 * api/ezplm-resource.js — ezPLM 资源代理
 *
 * 为什么需要：ezPLM 返回的文件 URL（七牛云）带时效签名且跨域，
 * 浏览器直接 fetch 会 CORS 失败；签名几小时后过期。
 * 通过本代理同源获取，同时把上游错误暴露出来而不是静默失败。
 *
 * 用法: /api/ezplm-resource?url=<encodeURIComponent(原始URL)>
 */
// 后缀匹配而非精确匹配：ezPLM 的七牛云空间会换子域（qn / cdn / file...），
// 精确列表一漏就是用户侧的 403。仍限定在 ezplm 自有域内，不放开任意主机（SSRF）。
const ALLOWED_SUFFIXES = [
  /(^|\.)ezplm\.com$/i,
  /(^|\.)ezplm\.cn$/i,
  /^raw\.githubusercontent\.com$/i,   // KiCad 官方库（内置示例用）
];
const isAllowedHost = h => ALLOWED_SUFFIXES.some(re => re.test(String(h || "")));

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
  if (!isAllowedHost(target.hostname)) {
    fail(req, res, 403, `不允许的主机: ${target.hostname}`,
      "该地址不在 ezPLM 资源域内，请直接访问原链接");
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });

    if (!upstream.ok) {
      const auth = upstream.status === 401 || upstream.status === 403;
      fail(req, res, upstream.status, `资源获取失败 (${upstream.status})`,
        auth ? "ezPLM 文件链接带时效签名，可能已过期；请回到器件页重新查询以获取新链接"
             : "上游未能提供该文件，请稍后重试或改用 datasheet 原始出处");
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
    fail(req, res, 502, e.name === "TimeoutError" ? "上游超时" : e.message, "请稍后重试");
  }
};

/**
 * 这些链接是用户在新标签页直接点开的，返回裸 JSON 等于给用户一屏乱码
 * （线上反馈的「401 Authorization Required」正是上游 nginx 的默认错误页）。
 * 浏览器导航请求回可读的中文页面，程序化 fetch 仍回 JSON。
 */
function fail(req, res, status, error, hint) {
  const wantsHtml = String(req.headers?.accept || "").includes("text/html");
  if (!wantsHtml) {
    res.status(status).json({ error, hint });
    return;
  }
  const esc = t => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(status).send(`<!doctype html><meta charset="utf-8">
<title>资源不可用</title>
<div style="font:14px/1.7 system-ui,sans-serif;max-width:520px;margin:16vh auto;padding:0 20px;color:#2c3338">
  <div style="font-size:17px;font-weight:600;margin-bottom:10px">资源暂时无法打开</div>
  <div style="color:#5a636c">${esc(error)}</div>
  ${hint ? `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#f5f8f6;color:#3d4a42">${esc(hint)}</div>` : ""}
  <div style="margin-top:16px;font-size:12px;color:#8a939b">AltPart Pro · 资源代理</div>
</div>`);
}

function guessType(pathname) {
  if (/\.(kicad_mod|kicad_sym|lib|wrl)$/i.test(pathname)) return "text/plain; charset=utf-8";
  if (/\.pdf$/i.test(pathname)) return "application/pdf";
  if (/\.(step|stp)$/i.test(pathname)) return "application/octet-stream";
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(pathname)) return "image/*";
  return "application/octet-stream";
}
