# AltPart Pro 升级 Backlog

本轮（v5.5 → v6.0）完成情况。**分类严格区分"已实现 / 部分实现 / 未实现 / 因缺凭证未验证"**，
未做的不写成已做。

---

## ✅ 已实现并有测试覆盖

| 项 | 说明 | 测试 |
|---|---|---|
| QuantityIR | 原型号与候选各自解析 value+unit，不再"候选裸值套原型号单位" | `test/quantity.test.js` 56 例 |
| 跨单位等值 | 72MHz==72,000,000Hz / 3.3V==3300mV / 1A==1000mA / 10kΩ==10000Ω / 100nF==0.1µF | 6 例 |
| KB vs KiB | SI(1000) 与 binary(1024) 明确区分 | 5 例 |
| 比较语义 | exact / range_cover / higher_better / lower_better / nearest / compatible_set / conditioned / boolean / enum / text_match | `test/scoring.test.js` |
| 更优候选不再扣分 | 耐压 30V→100V、静态电流 700µA→50µA 现为满分 | 9 例 |
| 范围端点覆盖 | 不再只比中点；-40~85 需被完整覆盖 | 5 例 |
| 条件参数 | Rds(on)@Vgs、Dropout@Iout 条件不同时不直接比较，降级为待确认 | 4 例 |
| 硬约束缺失拦截 | 缺失 → NEEDS_VERIFICATION 且不进正常排名；违反 → REJECTED | 3 例 |
| 约束语义 cover/within | 温度等范围参数按"覆盖"判定，此前按"落在区间内"导致误放行 | 7 例 |
| 无 Pin Map 不判直接替代 | pinVerified=false 时最高 COMPATIBLE_WITH_REVIEW | 2 例 |
| 未验证型号隔离 | `unverified` 候选强制 NEEDS_VERIFICATION | 1 例 |
| 推荐等级枚举 | DIRECT_REPLACEMENT / COMPATIBLE_WITH_REVIEW / FUNCTIONAL_ALTERNATIVE / REDESIGN_REQUIRED / NEEDS_VERIFICATION / NOT_RECOMMENDED / REJECTED | — |
| API 错误语义 | 400/401/403/429/500/502/504 + 统一 `{success:false,error:{code,message,requestId}}` | `test/api-contract.test.js` 15 例 |
| market 批量上限 | 超过 8 个返回 400（此前静默截断并返回成功） | 4 例 |
| 版本统一 | package.json / health / 页面统一读取 `6.0.0` | — |
| RuleProfile | 五种模式的确定性门槛（封装一致性/国产厂商/价格可知/覆盖率下限/权重加成） | `test/rule-profiles.test.js` 33 例 |
| 生产验收脚本 | `npm run verify:live <url>` 针对真实密钥部署做只读验收 | — |
| CI | GitHub Actions：install → 语法检查 → 测试 → audit，**不依赖生产密钥** | — |
| 静态检查 | `scripts/check.mjs`：后端语法 + 前端 JSX 未定义引用（曾因此白屏） | — |

**测试总计 166 例，全部通过。**

---

## ⚠️ 部分实现

| 项 | 已做 | 未做 |
|---|---|---|
| 数据源优先级 | ezPLM → DigiKey/Mouser → AI 的级联已在 `pipeline.js` 实现 | 未做 MPN 规范化与 manufacturer 交叉确认；分销商模糊匹配仍可能冒充 exact |
| Evidence | 参数层面已带 `source/sourceLabel/confidence` | 未建立独立 `Evidence` 实体（id/page/section/extractedText/retrievedAt/verified） |

| 应用场景 | `applyScenarioPriority()` 已实现并在后端生效 | 前端仍总是提交 `priorityOrder`，导致场景重排被覆盖；`scenarioHardParams()` 未接入过滤 |
| Pin Map | 有引脚提取与 `pinVerified` 门槛 | 无 `PinMapComparison` 逐引脚比较表、无 PackageVariant 维度的缓存键 |
| PDF 提取 | 引脚表 + 引脚配置图双规则，程序优先 | 仍限制前 12 页；缓存键未含 datasheet hash / package variant / extractor version |
| 文件代理 | 有主机白名单、超时、大小限制 | 仍一次性读入内存，未流式传输 |

---

## ❌ 未实现（需要更多轮次）

1. **数据库驱动候选召回** — 当前候选仍由 Gemini 生成。110 万型号库的程序化召回需要 ezPLM 提供条件检索 API（见 `docs/EZPLM_API_REQUIREMENTS.md`）。
3. **鉴权 / 限流 / 配额** — 当前接口仍 `Access-Control-Allow-Origin: *` 且无认证。
4. **缓存与反馈持久化** — 仍为 Serverless 内存，冷启动丢失。
5. **前端模块化** — 仍是单文件 ~1900 行 JSX + 浏览器端 Babel。
6. **Golden Set** — 未建立 LM358/STM32F103/AD8331 等分类 fixtures。
7. **国产替代的确定性厂商国别** — 仍依赖品牌名判断，无制造商主数据表。
8. **低成本模式的采购参数** — 用户无法指定地区/数量/包装/交期容忍度。

---

## 🔒 因缺少凭证未能验证（不得视为已验证）

以下均**未**用真实密钥端到端跑通，仅有 mock/契约测试：

- ezPLM API（无 `EZPLM_API_KEY`）
- DigiKey / Mouser API（无凭证）
- Gemini API（无 `GEMINI_API_KEY`）
- Vercel 部署与 `/api/health` 线上返回
- KiCad 官方库 gitlab 拉取（网络受限）
- PDF 数据手册真实下载解析（仅用离线文本片段测试规则）

---

## 下一轮建议顺序

1. 前端 priorityOrder 覆盖问题 + scenarioHardParams 接入 — 修复"场景声称已重排但实际未变"
3. Evidence 实体 + 分销商 exact MPN 校验 — 堵住 AI 自我验证闭环
4. CandidateRepository 接口 + ezPLM API 契约文档落地
5. 鉴权与限流 middleware
6. 缓存/反馈持久化适配器
7. Golden Set fixtures
8. PDF 提取缓存键与全文索引
9. 文件代理流式传输
10. 前端渐进式模块化（先抽 services/ 与 hooks/，不做全量重写）
