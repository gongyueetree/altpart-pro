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

---

# v6.2.0 轮次（针对 2026-08-01 线上回归测试）

## ✅ 本轮完成（均有测试）

| 提示词章节 | 修复内容 | 测试 |
|---|---|---|
| §3 推荐错误语义 | 10 个业务错误码 + HTTP status 映射 + requestId + stage + retryable；上游异常经 `cause` 正确分类；阶段计时 | `recommend-contract.test.js` 15 例 |
| §3.2 前端 | 检查 `r.ok` 与 Content-Type；错误对象逐字段读取（消除 `[object Object]`）；45s AbortController 超时；防重复点击并发 | — |
| §4 虚构型号 | AI 结果一律 `unverified`；`looksFictitious()` 识别；analyze 返回 404/422 且不进工作台、不写缓存 | `fictitious-part.test.js` 6 例 |
| §5 身份错位 | `ResolvedPartIdentity`、`splitMpn`、`guardResource`、`identityCacheKey`（含厂商+封装+canonical） | `part-identity.test.js` 37 例 |
| §6 引脚高亮 | `normPin()` 规范化（数字/EP/PAD/NC）；符号↔封装用同一 key；再点取消；高对比度光晕；`role=button`+键盘 | — |
| §8 场景重排 | `reorderByApplication()` 真实重排；`orderSource` 追踪；用户拖拽后不被覆盖 + 「恢复场景默认排序」；只在真变化时显示提示 | — |
| §9.2 约束校验 | `validateConstraint()`：min>max 拒绝、离散参数拒绝数值范围、端点必须为数值；后端二次校验返回 400 | `constraint-validation.test.js` 12 例 |
| §9.3 厂商去重 | 前后端 canonical 别名归一；删除按钮改 `button`+aria-label | 5 例 |

**测试 166 → 238 例，全部通过。**

## ❌ 本轮未完成（下一轮）

| 章节 | 项 | 原因 |
|---|---|---|
| §5 | 把 identity 接入 ezPLM/详情/eCAD 全链路 | 模块已建好且有测试，但 `_lib/ezplm.js`、`part-detail`、eCAD 仍用旧的按型号缓存键；接入需改动多处调用点 |
| §7 | 统一 `DownloadButton` 组件 | 需前端组件化 |
| §10 | 低成本真实采购模式（地区/数量/包装/币种/交期） | 需前端表单 + 分销商分区域报价接口 |
| §11.1 | base device 去重（VCA2615Y/2K5 系列占满 Top3） | 需接入 `splitMpn().baseDevice` 到 pipeline 排序 |
| §11.2 | `authoritativeEvidenceCoverage` 与 `fieldCoverage` 分离 | 需改评分输出结构与前端展示 |
| §12 | Mouser「交期 441 天」字段映射核查 | 需真实 API 响应样本 |
| §13 | AD8331 官方 PDF 证据化（页码/表格区域/hash） | PDF 规则已有，缺证据实体与 UI 标注 |
| §14 | 构建时 JSX 编译、模块拆分、a11y | 工作量大，需独立轮次 |
| §15 | 分阶段加载提示、Server-Timing、取消请求 | 后端已有 timings，前端未展示 |
| §16 | WebGL capability 预检 | — |
| §17.1 | Playwright E2E（19 项） | 沙箱无浏览器环境 |
| §17.3 | Golden Set fixtures | — |

## 🔒 仍未验证（需真实环境）

- 五种模式在真实 ezPLM/Gemini 下的实际表现（沙箱无密钥、网络不通上游）
- 浏览器端下载事件（Blob/MD/CSV/kicad_sym）
- 引脚高亮的真实 DOM 表现（需浏览器 E2E）
- LM358ADR 端到端身份一致性（需真实上游数据）

建议部署后运行 `npm run verify:live <url>` 覆盖后端部分。

---

# v6.3.0 轮次（八项指定修复）

## ✅ 完成

| # | 项 | 实现 | 测试 |
|---|---|---|---|
| 1 | LM358ADR 串料 | 身份对象接入 `_lib/ezplm.js` 全链路；无 exact 匹配不返回替代型号；`guardResource` 拦截异厂/异器件资源；缓存键含 canonical 厂商+封装 | `identity-integration.test.js` 12 例 |
| 2 | 引脚双向高亮 | `normPin/samePin` 抽为共享模块；点焊盘自动切换到含该引脚的单元；再点取消；高对比度光晕；`role=button`+键盘 | `pin-linkage.test.js` 33 例 |
| 3 | 评分解释 | `lower_better` 文案改为「偏高/偏低 + 优/劣」；0.3mV→0.5mV 显示"明显劣于原型号（偏高 67%）"，不再说"低于" | `scoring.test.js` |
| 4 | 错误展示 | 前端逐字段读 `error.code/message/requestId/retryable`；10 个业务码中文映射；HTTP+Content-Type 校验 | `recommend-contract.test.js` |
| 5 | 未验证候选隔离 | `isAuthoritative()`（仅 ezPLM/分销商 exact）；非权威进 `pendingVerification`，不占正式 Top N | 2 例 |
| 6 | 低成本采购条件 | 前端地区/数量/包装/币种/仅现货；后端只认 `source==="distributor_api"`；按真实价格升序；修复"行情在门槛判定后才附加"的顺序缺陷 | `rule-profiles.test.js` 5 例 |
| 7 | 场景硬约束 | `scenarioHardParams` 合并进 `effectiveConstraints` 真正参与过滤；用户约束优先不被覆盖 | `scenario-constraints.test.js` 6 例 |
| 8 | 下载按钮统一 | 共享 `DownloadButton`（统一高度 32/padding/字号）；来源用 badge 而非颜色区分；生成文件标 `NOT_FOR_PRODUCTION`；MD/CSV 同组件 | — |

## ❌ 仍未完成

- **Playwright E2E**（§17.1 的 19 项）：沙箱无浏览器，引脚高亮/下载事件只有逻辑层测试
- **base device 去重**（VCA2615Y/2K5 系列占满 Top3）
- **`authoritativeEvidenceCoverage` 与 `fieldCoverage` 分离**
- **Mouser「交期 441 天」字段核查**：需真实响应样本
- **AD8331 官方 PDF 证据实体**（页码/表格区域/hash）
- **前端构建时编译与模块拆分**、a11y 全面整改
- **Golden Set fixtures**
- 变体确认页未接入 `ambiguous` 返回（ezPLM 已返回候选集合，前端尚未消费）

## 🔒 未验证

沙箱无密钥、网络不通上游、无浏览器。以下需部署后验证：
五种模式真实表现、LM358ADR 线上身份一致性、引脚高亮 DOM、四类 Blob 下载、低成本真实报价排序。
