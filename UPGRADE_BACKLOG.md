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

## v6.3.2 — 参数对齐修复

线上现象：候选标着 ezPLM 徽章、封装/类型/应用有值，其余全 N/A，证据覆盖率仅 33%。

根因不是没数据，是**参数名对不上**。ezPLM 的命名带限定词与单位后缀：
```
原型号「等效输入噪声」   vs  候选「输入噪声密度[典型值](nV/√Hz)」
原型号「工作温度」       vs  候选「工作温度[范围](°C)」
原型号「供电电压范围」   vs  候选「电源电压[最小值](V)」
原型号「通道数」         vs  候选「通道数量」
```
旧代码用朴素 `includes` 匹配，这些形态全部失配。

修复：新增 `_lib/param-align.js`
- `normalizeName()` 剥离 `[典型值]`/`(V)`/标点/空格
- 28 组同义词表（中英混合）
- 一对一匹配，同一候选参数不被重复占用
- 防误配：`增益` 不匹配 `增益带宽积`，`工作温度` 不匹配 `工作电压`

实测同场景覆盖率 **33% → 100%**。

同时新增诊断：候选自身有、但原型号无对应项的参数会列在「该候选另有 N 项参数未参与对比」，
便于区分"没数据"与"没对齐上"。

测试：`param-align.test.js` 30 例。全量 297 → 327。

## v6.4.0 — 品类代表性参数

线上现象（AD8331 / VGA）：左栏 7 个参数位是
```
1 类型   4 Type                      ← 同一参数中英重复
2 应用   5 Applications              ← 重复
3 封装   6 Package / Case            ← 重复
         7 Supplier Device Package   ← 又重复
```
四项重复，且**没有一个技术指标**。而 ezPLM 该器件实际有：
供电电压 5V、噪声 0.74 nV/√Hz、增益 −4.5~+43.5 dB、功耗 125 mW、−3dB带宽 120 MHz。

两个缺陷：
1. 合并 ezPLM + 分销商 + AI 时**未按语义去重**
2. **没有品类参数模板**，参数排序与器件类型无关

修复：新增 `_lib/category-params.js`
- 14 个品类模板（VGA/运放/仪放/比较器/基准/LDO/DC-DC/MCU/ADC/DAC/MOSFET/射频/解调/传感器），每个 8–11 项代表性参数并按重要度排序
- 语义去重：同一参数保留信息量最大者，权威来源（ezPLM > 分销商 > AI）优先
- 排序优先级：**有值的模板参数 → 有值的其它参数 → 有值的通用字段 → 无值参数**
  （模板顺序不得压过"有没有值"）
- 通用字段（应用/包装/库存/生命周期等）殿后
- 输出 `missingTemplateParams`，UI 提示"该品类常用但当前无数据：…"

实测同场景：12 项 → 8 项（4 个重复合并），顺序变为
**增益 → 带宽 → 噪声 → 供电电压 → 功耗 → 封装 → 类型 → 应用**

同时补充 param-align 同义词：前置放大器噪声≡等效输入噪声、−3dB带宽≡带宽、增益范围≡增益。
并把「带宽」与「增益带宽积」拆为两组，避免 VGA 的 −3dB 带宽被误配成运放的 GBW。

测试：`category-params.test.js` 39 例。全量 327 → 366。

### 仍未完成
- 模板缺失参数的**主动补齐**：目前只提示"该品类常用但当前无数据"，未自动向分销商/PDF 追加查询
- 品类模板尚未覆盖：连接器、无源器件、光电器件、电源模块
- 用户自定义模板与企业级默认参数集

## v6.4.1 — 修复 CI 失败

现象：本地 `npm test` 与 `node scripts/check.mjs` 全通过，GitHub Actions 却 exit 1。

根因：`package.json` 的测试命令写成
```
node --test "test/*.test.js"
```
**引号阻止了 shell 展开**，通配符被交给 Node 处理。而 Node 的 `--test` 通配符支持是
v22 才加入的，CI 用的 Node 20 会把 `test/*.test.js` 当字面文件名，找不到 → exit 1。
本地 Node 22 正常，因此没能提前发现。

修复：
- 去掉引号 → 由 shell 展开成文件列表，Node 18/20/22 均可用
- CI 改为 **Node 20 + 22 矩阵**，防止再出现"本地过、CI 挂"的版本差异
- `actions/checkout@v4 → @v5`，消除 Node 20 弃用警告

## v6.4.2 — 分销商串料 + 待核验候选未渲染

### ① TL431 参数变成液位传感器（P0）

线上现象：查 TL431，参数列表出现
```
Type: Liquid
Output Configuration: PNP
Material - Housing & Prism: 316 Stainless Steel
```
这是**液位传感器**的参数，与 TL431 毫无关系。

根因在 `distributor.js`：
```js
const p = list.find(精确匹配) || list.find(前缀匹配) || list[0];   // ← 元凶
```
`|| list[0]` 在两级匹配都失败时**无条件接受搜索结果第一条**。
DigiKey 关键词搜 "TL431" 返回了液位传感器，就被当成 TL431 的数据写进参数表。

修复：
- 新增 `pickExact()`：归一化 MPN 完全相同 → 去包装后缀相同 → 同基础器件（且长度≥4）；
  三级都不中就返回 null，**宁可没有也不用模糊结果**
- DigiKey 与 Mouser 都命中时校验厂商一致，不一致则不合并

### ② "推荐失败（HTTP 200）"

后端把未经权威验证的候选分流到 `pendingVerification` 并返回 `success:true`，
但前端只检查 `recommendations.length`，于是把"有结果但需核验"误判为失败。

修复：前端同时检查两者，并新增待核验候选区（半透明、橙色说明条、逐条标注 pendingReason）。

### ③ 参数缺单位

线上出现 `输入偏置电流 150000`、`供电电压 32`、`工作温度 70` —— AI/分销商补的参数丢了单位。
新增 `inferUnit()`：按参数名补默认单位并标 `unitInferred`；
值里已有单位、无量纲参数（通道数）、文本值（封装）均不处理。

测试：`distributor-exact.test.js` 22 例。全量 366 → 388。

## v6.4.3 — 前端缓存导致新后端配旧前端

现象：`/api/health` 已返回 v6.4.2，接口实测 `success:true`、`finalCount:3`，
页面却仍显示"推荐失败（HTTP 200）"。

根因：`vercel.json` 只给 `/api/(.*)` 设了 `no-store`，**`index.html` 无任何缓存控制**。
本项目前端是单文件 HTML，被浏览器/CDN 缓存后，部署新版仍跑旧代码 ——
新后端返回 `pendingVerification`，旧前端不认识该字段，落入"推荐失败"兜底分支。

修复：
- `index.html` 与 `/` 设 `public, max-age=0, must-revalidate`（每次校验，内容未变仍走 304）
- `/vendor/*`（OCCT wasm）设 `immutable` 长缓存
- 顶部标题旁显示版本号，可直接肉眼确认部署是否生效
- 兜底分支输出响应结构诊断（success/各数组长度/requestId），不再是无信息的死胡同
- 兼容 `error` 为字符串的旧格式

## v6.4.4 — ezPLM 有的器件却报"未收录"

现象：TL431ACDBVRG4 在 ezPLM 中确实存在（有完整物料属性、PDF、ECAD 模型），
详情弹窗却显示"该器件未收录于 ezPLM 元器件库"。

根因：v6.3.1 为了让基础型号（如 AD8331）也能找到变体，把 `queryLocalDB` 改成
**只用基础型号检索**：
```
TL431ACDBVRG4 → 提取基础型号 TL431 → keyword=TL431&pageSize=30
```
但 TL431 系列在 ezPLM 有数百个订货号，前 30 条里未必包含 TL431ACDBVRG4，
于是精确匹配失败 → 判定为未收录。

修复：改为**两段式检索**
1. 先用完整型号精确查（pageSize=20），命中即用
2. 未命中再用基础型号扩大范围（pageSize=40），合并去重后判定

兼顾了"精确型号优先"与"基础型号能找到变体"两个需求。

测试：`identity-integration.test.js` 新增 3 例（含"先完整型号再基础型号"的调用顺序断言）。

## v6.5.0 — 按测试报告实施 P0 修复（20260803 报告）

### ALT-001 / S1：MPN 与厂商、资料不是同一器件 ✅
根因：`queryPartDetail` 只守卫了 `downloads` 数组，而前端用的是 `...base` 展开的
**顶层字段**（`datasheetUrl` / `productUrl` / `symbolUrl` …），这些从未过守卫。
于是 ST 的官网链接与 `LM258DT.pdf` 仍会显示在 TI 的 LM358AM/NOPB 页面上。

修复：顶层资源字段全部经 `guardResource`，未通过者**置 null**而非保留旧值；
被拦截项进 `blockedResources`，UI 明确告知"有 N 项资源因身份不符已被拦截"。

### ALT-002 / S1：同一 MPN 重复且内容冲突 ✅
新增 `dedupeVariants()`：按「canonical 厂商 + 归一化完整 MPN」去重，
保留信息最完整的一条；描述/封装不同的重复记录标 `duplicateConflict` 并输出 `conflicts`。
不同厂商的同名 MPN 不合并。变体列表显示厂商与 `⚠ 重复记录` 标记。

### ALT-003 / S1：硬约束为 N/A 时候选仍被正式推荐 ✅
根因：评分层已正确标记 `needsVerification`，但 **pipeline 从不检查该标记**，
候选照样进 `recommendations` —— fail-open。

修复：正式推荐条件改为 `authoritative && !needsVerification`（fail-closed）；
硬约束未知的候选进入待核验区并说明具体原因。
验收用例覆盖：值为 N/A → 不进 Top N；补齐结构化值 → 恢复正常推荐；
AI 描述称"128 KB Flash"也不能替代结构化字段通过约束。

### ALT-005 / S2：`[object Object]` ✅
`analyze` 端点的前端处理仍把 error 对象拼进模板串。
改为逐字段读取 `code/message/requestId/details.hint/details.aiSuggestion`，
并补上 `r.ok`、Content-Type 校验、45s AbortController、防重复点击。

### ALT-010 / S3：页头页脚版本不一致 ✅
版本号统一由 `APP_VERSION` 常量驱动，package.json 同步。

### ALT-011 / S3：优选厂商空输入仍可点击 ✅
输入为空时按钮 `disabled` + `aria-disabled`。

---

### 本轮未处理（报告中的其余问题）
ALT-004（STM32F303 被误分类为 comparator）、ALT-006（交期 280/1960 天异常值）、
ALT-007（参数单位重复显示）、ALT-008/009（键盘可访问性与 aria 状态）、
ALT-012（浏览器端 Babel）、ALT-013（分销商页被标为制造商官网）、
ALT-014（MD/CSV 遗漏待核验候选）、ALT-015（导出文件缺 NOT_FOR_PRODUCTION）、
ALT-016（封装未关联 STEP）。

测试：392 → 404 例，全部通过。

## v6.6.0 — 完成测试报告全部 16 项

| 编号 | 问题 | 修复 |
|---|---|---|
| ALT-001 S1 | 资料串料 | 顶层资源字段（datasheetUrl/productUrl…）接入 `guardResource`，未通过置 null，被拦项进 `blockedResources` 并在 UI 说明 |
| ALT-002 S1 | 同 MPN 重复冲突 | `dedupeVariants()` 按 canonical 厂商 + 归一化 MPN 去重，冲突记录标 `⚠ 重复记录` |
| ALT-003 S1 | 硬约束 N/A 仍进推荐 | 正式推荐条件改为 `authoritative && !needsVerification`（fail-closed） |
| ALT-004 S2 | STM32F303 被判为 comparator | MPN 前缀受控映射优先于描述关键词（F303 内置比较器导致误判） |
| ALT-005 S2 | `[object Object]` | analyze 端点逐字段读取 code/message/requestId/hint/aiSuggestion + 45s 超时 |
| ALT-006 S2 | 交期 280/1960 天 | `normalizeLeadTime()` 统一转天，>365 天标异常且不参与排序，带 `retrievedAt` |
| ALT-007 S3 | `64 KB KB` | `format.js` 统一 formatter，值含单位则不再拼接；仅数值开头才加单位 |
| ALT-008 S3 | 变体卡不可键盘操作、弹窗无 dialog 语义 | 变体卡改 `button`；弹窗加 `role=dialog`/`aria-modal`/Escape/焦点陷阱/焦点归还 |
| ALT-009 S3 | 模式与视图无语义状态 | 替代模式 `role=radiogroup`+`aria-checked`；结果视图 `role=tab`+`aria-selected` |
| ALT-010 S3 | 页头页脚版本不一致 | 统一 `APP_VERSION` 常量，package.json 同步 |
| ALT-011 S3 | 空厂商可点添加 | 输入 trim 后为空则 `disabled`+`aria-disabled` |
| ALT-012 S3 | 浏览器端 Babel | `npm run build` 用 @babel/core 预编译为 `dist/app.<hash>.js`，生产 HTML 不再加载 babel-standalone；源文件保留 `index.src.html` |
| ALT-013 S4 | 分销商页冒充官网 | `classifyProductUrl()` 域名判定，拆 `manufacturerUrl` / `distributorUrl` |
| ALT-014 S2 | 导出遗漏待核验候选 | 导出改由统一模型驱动：正式推荐 + 待核验 + 淘汰摘要 + 查询条件 + 约束 + 参数优先级 + 版本 + 时间 + 免责声明；0 正式推荐时写明原因 |
| ALT-015 S3 | 导出文件缺风险标记 | `.kicad_sym` / `.kicad_mod` 首部注释 + KiCad 属性写入 `status`/`generator`/`generated_at`/`source_uuid`，非权威来源标 `NOT_FOR_PRODUCTION` |
| ALT-016 S3 | 封装未关联 STEP | `annotateFootprint()` 移除 `KICAD6_3DMODEL_DIR` 引用，改为 `${KIPRJMOD}/<name>.step` 相对路径 |

测试：404 → **445 例，全部通过**。

### 与报告验收标准的差距（诚实说明）
- **ALT-012 部分完成**：已消除浏览器端 Babel，但 React/ReactDOM 仍走 CDN UMD，未做代码分割与 sourcemap 管理
- **ALT-016 部分完成**：封装已引用同目录 STEP，但**未提供打包下载的资源包**；用户仍需手动把三个文件放同一目录
- **未做真实浏览器验证**：ALT-008/009 的键盘与屏幕阅读器行为、四类 Blob 下载事件，均无 Playwright E2E（沙箱无浏览器）
- **ALT-006 阈值 365 天为经验值**，未经真实分销商样本回放校准
