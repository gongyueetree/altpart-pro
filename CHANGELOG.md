# CHANGELOG

## v6.0.0 — 评分正确性重构（P0）

### 修复（均有回归测试）
- **跨单位比较错误**：72 MHz 与 72,000,000 Hz 此前被判"差距显著"（10分），现为 100 分。
  根因是候选裸值套用了原型号单位；现改为原型号与候选各自解析 QuantityIR。
- **更优候选被扣分**：耐压 30V→100V（25分）、静态电流 700µA→50µA（59分）现均为 100 分。
  引入比较语义，不再一律"越接近越好"。
- **范围只比中点**：改为端点覆盖判定。
- **条件参数直接比较**：Rds(on)@Vgs=10V 与 @4.5V 现标记"测试条件不一致"并降级。
- **硬约束缺失绕过**：缺失现返回 NEEDS_VERIFICATION 且不进正常排名。
- **约束语义混淆**：温度等范围参数按"覆盖"判定（此前按"落在区间内"，导致 0~70°C 通过 -40~125°C 约束）。
- **market API 静默截断**：超过 8 个型号现返回 400（此前截断并返回成功）。
- **API 错误全部 200**：统一为 400/401/403/429/500/502/504 + `{success:false,error:{code,message,requestId}}`。
- **版本号三处不一致**：package/health/页面统一为 6.0.0。

### 新增
- `api/_lib/quantity.js` — QuantityIR（规范单位、范围、测试条件）
- `api/_lib/comparison-semantics.js` — 10 种比较语义 + 参数规则表
- `api/_lib/http.js` — 统一错误语义
- `test/` — 133 例单元与契约测试
- `.github/workflows/ci.yml` — 不依赖生产密钥的 CI
- `scripts/check.mjs` — 后端语法 + 前端未定义引用检查
- `docs/SCORING_ENGINE.md`、`docs/EZPLM_API_REQUIREMENTS.md`、`UPGRADE_BACKLOG.md`

### 未完成
见 `UPGRADE_BACKLOG.md`。主要缺口：RuleProfile、数据库驱动候选召回、鉴权限流、持久化、前端模块化。

## v5.5 及更早
见 git 历史。
