// _cors.js — 通用 CORS + 方法校验包装
// Vercel 同域部署时 CORS 非必需，但保留以便前后端分离或本地调试

// 允许来源白名单：环境变量 ALLOWED_ORIGINS（逗号分隔）。
// 未配置时维持 `*`（与既有行为一致，不影响现有 ezPLM iframe 接入）；
// 配置后仅回显白名单内的 Origin，避免公网部署被任意站点借用后端密钥额度。
function resolveOrigin(req) {
  const raw = String(process.env.ALLOWED_ORIGINS || "").trim();
  if (!raw || raw === "*") return "*";
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers?.origin;
  return origin && list.includes(origin) ? origin : list[0];
}

function withCors(handler, allowedMethods = ["GET", "POST"]) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", resolveOrigin(req));
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    if (!allowedMethods.includes(req.method)) {
      res.status(405).json({ error: `Method ${req.method} not allowed` });
      return;
    }
    try {
      await handler(req, res);
    } catch (e) {
      console.error("[Handler error]", e);
      if (!res.headersSent) res.status(500).json({ error: e.message || "Internal error" });
    }
  };
}

module.exports = { withCors, resolveOrigin };
