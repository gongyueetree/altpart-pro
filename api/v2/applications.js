// GET /api/v2/applications — 应用场景列表（前端渲染选择器）
const { withCors } = require("../_lib/_cors");
const { APPLICATIONS } = require("../_lib/applications");

module.exports = withCors(async (req, res) => {
  res.status(200).json({
    success: true,
    applications: Object.entries(APPLICATIONS).map(([code, a]) => ({
      code, label: a.label, icon: a.icon, desc: a.desc,
    })),
  });
}, ["GET"]);
