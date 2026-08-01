// GET /api/health — 健康检查 + 配置状态
const { withCors } = require("./_lib/_cors");
const APP_VERSION = require("../package.json").version;

module.exports = withCors(async (req, res) => {
  res.status(200).json({
    status: "ok",
    service: `AltPart Pro v${APP_VERSION}`,
    time: new Date().toISOString(),
    config: {
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      ezplmConfigured: !!process.env.EZPLM_API_BASE,
      mode: process.env.EZPLM_API_BASE ? "production" : "demo (built-in mock data)",
      scoringEngine: `v${APP_VERSION} (QuantityIR + 比较语义 + 硬约束缺失拦截 + 引脚证据门槛)`,
    },
  });
}, ["GET"]);
