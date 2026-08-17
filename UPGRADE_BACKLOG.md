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

## v6.7.0 — 修复 v6.5/6.6 引入的三个回归

### ① 3D 无法旋转缩放、STEP 被拦截（我引入的回归）
现象：STM32F103C8T6TR 在 ezPLM 有 STEP，页面却显示"示意渲染 / ezPLM 未提供 STEP"，
并提示"有 2 项资源因与当前器件身份不符已被拦截
（TQFP-48_7x7mm_P0.5mm.kicad_mod、TQFP-48_7x7mm_P0.5mm.step）"。

根因：身份守卫的文件名校验要求文件名包含型号基础器件，
但**封装与 3D 文件按 KiCad 惯例是以封装名命名的**（`TQFP-48_7x7mm_P0.5mm.step`），
本就不含型号 → 合法文件被全部误拦 → 3D 退回示意图。

修复：文件名校验只对**按型号命名**的资源（datasheet / 符号）生效；
`footprint` / `model3d` 跳过；并增加"文件名形似封装名"的兜底识别。
异器件 datasheet（LM2904/LM258）与异厂商资源仍被拦截。

### ② 变体列表混入不同规格器件
现象：查 STM32F103C8T6，变体列表出现 C4T6A(16KB)、C6T6A(32KB)、C6U6A(QFN) 等。

根因：变体检索用 `baseDevice = STM32F103`，把整个系列都当成了变体。
但 C4/C6/C8 是**不同 Flash 容量的器件**，不是同一器件的封装/包装变体。

修复：新增 `variantKinship()` 四级亲缘度
（`same_orderable` 仅差包装后缀 → `same_device` 输入是其前缀 → `same_family` 同系列 → `unrelated`），
`pickVariants()` 只保留最近一档；无直接变体时才回退同系列，并报告"同系列另有 N 个"。
实测：STM32F103C8T6 由 8 个候选收敛为 3 个真正变体（C8T6 / C8T6TR / C8T6A）。

### ③ 参数值出现 `105||85`
ezPLM 用 `||` 作多值分隔符。新增 `normalizeMultiValue()`：
数值型用 ` / ` 连接（`105 / 85 °C`），文本型用 `、` 连接（`Dual Watchdog、RTC、SysTick`）。

测试：445 → **469 例，全部通过**。
（过程中测试抓到我删除 `sameFamily` 变量却漏改引用的错误。）

## v6.8.2 — 淘汰列表仍不显示

现象：提示"已排除 12 个候选，见下方淘汰列表"，下方仍然空白。

两个原因叠加：

1. **v6.8.1 的替换未生效**：我用字符串替换改前端，锚点与实际代码不符，
   替换静默失败，那一处仍是旧代码（`setResult` 后没有 `setPhase("done")`）。
   而结果区的渲染条件是 `phase === "done"`，于是整块不渲染。
   → 已修正，并写脚本校验**所有** `setResult(eliminated)` 分支都配有 `setPhase("done")`（4/4 通过）。

2. **验证方式不可靠**：此前只跑语法与未定义引用检查，
   不能发现"替换没生效"这类问题。

### 构建产物自检
排查中一度以为产物缺失界面文案 —— 实为 Babel 把非 ASCII 转成 `\uXXXX`（**大写**十六进制），
直接 grep 中文必然落空。已把带转义规则的抽样校验固化进 `scripts/build.mjs`：
从源码抽取 12 处 JSX 中文文案，逐一确认存在于产物，否则构建失败。

### 顺带修复
- `pipeline.js` 硬约束淘汰分支字段名写错（`result.eliminated/elimReason`，
  实际应为 `rejected/rejectReason`），导致该分支**从未触发**，硬约束违规候选
  未被明确淘汰、原因丢失。
- 淘汰项增加 `stage` 标记（`ai_filter` / `category` / `hard_constraint` / `mode_gate` / `lookup_failed`），
  前端据此分组；"未查到数据"与"技术不合适"分开呈现并给出不同建议。

## v6.9.0 — 国产厂商误判 + 淘汰候选评分详情

### ① 国产替代把真正的国产料排除了（严重）
线上淘汰列表显示：
```
XL431ACDBVT   国产替代模式：XLSEMI 非国产品牌
CJ431ACDBVT   国产替代模式：Changjiang Electronics (CET) 非国产品牌
```
XLSEMI（芯龙）、CET（长电）都是中国厂商。原因是那份 40 条品牌关键词表覆盖太窄。

修复：新增 `_lib/manufacturers.js`
- 中国大陆 ~90 家（MCU/模拟/电源/分立/存储各条线）
- 中国台湾 ~25 家（与大陆区分，`includeTaiwan` 可控）
- 明确境外 ~45 家
- **三态判定**：`CN`/`TW` → 国产；`OVERSEAS` → 明确排除；
  `UNKNOWN` → **不武断排除**，降级为待核验并提示"厂商归属未收录，需人工确认"

此前未收录厂商一律判为"非国产"，等于把没进关键词表的国产料全排除了。

### ② 淘汰候选缺少评分详情
用户只看到"综合可信度过低 (35分)"，不知道哪些参数合适、哪些不合适。

修复：
- 淘汰项保留 `detail`（技术兼容/证据覆盖/来源可信/结论可信 + 逐参数评分）
- 淘汰列表**按结论可信度降序**，最接近合格的排最前
- 前 5 个可展开逐参数对比，**不满足的参数排最前**，标注
  `原值 → 候选值 · 分数 · 结论`，优于原型号的标 ⬆
- 响应体控制：前 5 个带完整 `paramScores`，其余仅四项指标摘要

### 过程记录
本轮改前端时连续 4 次替换失败，原因是 JSX 里写了 `{i<5&&<span…>}` ——
解析器把 `<` 当成标签起始。最终把该块抽成独立组件 `EliminatedRow`，
所有比较运算在 JSX 外完成。

测试：491 → **528 例，全部通过**。

## v6.9.1 — 上线前安全与依赖修复

### ① pdfjs-dist 高危漏洞（GHSA-hq66-cqwq-w95j）
`npm audit` 报 high：`pdfjs-dist >=5.6.83 <6.2.108` 存在「打开恶意 PDF 可执行任意
JavaScript」。本项目的 `_lib/pdf-pins.js` 会**下载第三方 datasheet URL 并在服务端解析**，
正是该漏洞的攻击面（虽已设 `isEvalSupported:false`，但不能替代升级）。

修复：`pdfjs-dist ^5.4.296 → ^6.2.108`，`npm audit` 归零。
`pdfjs-dist/legacy/build/pdf.mjs` 入口与 `getDocument` 调用签名在 v6 保持兼容，已实测验证。

### ② PDF 文本抽取缺字体与 CMap 资源
升级过程中发现既有告警：
`UnknownErrorException: Ensure that the standardFontDataUrl API parameter is provided.`

未提供 `standardFontDataUrl` 时，Type1 标准字体（Helvetica/Times 等，datasheet 主力字体）
会退化；未提供 `cMapUrl` 时**中文数据手册的 CJK 编码直接抽不出字**。
两者都会让引脚提取静默少读，且不报错 —— 属于 silent-wrong。

修复：
- `getPdfAssets()` 运行时解析 `pdfjs-dist/standard_fonts` 与 `cmaps`，目录不存在则不传参（不报错）
- `vercel.json` 为 `api/v2/ecad.js` 增加 `includeFiles`，确保这两个目录被打进函数
  （路径是运行时拼的字符串，Vercel 的文件追踪不会自动带上）
- 该函数内存 512MB → 1024MB（PDF 解析是本项目内存峰值所在）

### ③ CORS 任意来源
`Access-Control-Allow-Origin: *` 写死。公网部署后任意站点都能直接调用本后端，
借用服务端持有的 Gemini / ezPLM / DigiKey 密钥额度。

修复：新增 `ALLOWED_ORIGINS` 环境变量（逗号分隔）。
**未配置时仍为 `*`，既有 ezPLM iframe 接入不受影响**；配置后只回显白名单内的 Origin，
未命中不回显请求方 Origin，并补 `Vary: Origin` 避免 CDN 串缓存。

测试：528 → **539 例，全部通过**（`test/v691-fixes.test.js` 11 例）。

### 仍未处理
本轮只做上线阻塞项，未动 v6.9.0 遗留的功能性 backlog（鉴权/限流、缓存持久化、
Golden Set、Playwright E2E、前端模块化）。

## v6.9.2 — 线上反馈 8 项

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 页头/页脚版本号 | — | 移除显示，保留不可见 `data-app-version` 供部署核对 |
| 2 | 3D 报 `Error creating WebGL context` | `renderer.dispose()` 只释放 GPU 资源、**不归还 context**，浏览器上限约 16 个，反复开关即耗尽 | dispose 时 `forceContextLoss()`；加载前预检 WebGL 并给出可操作提示；创建失败逐级降级；监听 `webglcontextlost` |
| 3 | AI 推断管脚无引脚名 | 提示词写"含 EP 可略多"、校验却要求引脚数**严格相等** —— 自相矛盾，带散热焊盘的封装(QFN/SOIC-EP…)100% 被拒 | EP/PAD/TAB 排除出编号计数；开启 grounding（引脚名是强事实性内容，靠模型记忆最易整份编造）；被拒原因结构化回传前端 |
| 4 | 库文件资源链接 401 | 左栏「库文件与资源」的 `href` 直连 ezPLM 原始 URL（七牛私有空间签名链接），未走 `/api/ezplm-resource` —— 全站唯一漏改处 | 四个资源链接改走代理（官网产品页保持直连）；代理白名单改 ezPLM 域后缀匹配；浏览器直接点开时返回中文错误页而非裸 JSON |
| 5 | 推荐结果重复 | 去重只发生在 **AI 吐出型号字符串时**，只挡字面重复；`LM358`/`LM358DR`/`lm358-dr` 查询后解析到同一订货号，各持半份参数 | 新增 `_lib/candidate-merge.js`：查询后按「归一化 MPN + canonical 厂商」二次去重，按 **ezPLM > DigiKey/Mouser > AI** 逐参数合并，冲突记录不丢弃 |
| 6 | 去掉应用领域筛选 | — | UI 移除；`application` 降为常量；后端维度保留供 ezPLM 走 API 调用 |
| 7 | 国产替代 `INTERNAL_ERROR` | 候选全部查不到参数时抛**裸 Error** → 归入 INTERNAL_ERROR「服务内部错误·可重试」。国产模式最易命中：AI 给的国产型号 ezPLM 未收录、DigiKey/Mouser 不经销 | 新增业务码 `NO_CANDIDATE_DATA`（200/不可重试）+ 候选清单 + 针对国产模式的处置建议；前端不再用 `ERR_TEXT[code]||message` 吞掉后端 message |
| 8 | 调优先级后「重新推荐」无变化 | 两处叠加：① `getCandidates` 拿到的是 `original.parameters` 的**原始顺序**，只取前 6 个当关键参数 → 优先级从未到达 AI；② 候选缓存键 `cand10:型号:模式:场景:应用` **不含优先级与优选厂商** → 24h 内必命中旧候选 | 按优先级重排后再交给 AI，并在提示词中显式声明「第一优先项不得劣于原型号」；缓存键补入 `prio` 与 `mfrKey` |

第 7 项已用 stub 复现确认（`domestic` + ezPLM 未收录 + 分销商无货 → 旧代码必抛 INTERNAL_ERROR）。

测试：539 → **575 例，全部通过**（`test/v692-fixes.test.js` 36 例）。

### 未处理
- 第 5 项只做了**同一 MPN** 的合并；不同订货号但同芯片（如 `XX-T` 与 `XX-TR`）仍各占一位，需接 `variantKinship` 做系列级收敛
- 第 3 项 grounding 开启后引脚准确率需真实环境验证，沙箱无密钥
- 第 2 项 WebGL 预检与降级路径无浏览器 E2E 覆盖，仅逻辑层断言

## v6.9.3 — 修复 v6.9.1 引入的 Vercel 构建失败

现象：`git push` 后 Vercel 构建 1 秒即失败
```
Error: The pattern "api/v2/ecad.js" defined in `functions` doesn't match
       any Serverless Functions inside the `api` directory.
```

根因是我在 v6.9.1 加的 `vercel.json`：为把 pdfjs 字体/CMap 打进 ecad 函数，
在已有的 `api/**/*.js` 之外又加了一条 `api/v2/ecad.js`。
**Vercel 要求同一个函数文件只能被一个 `functions` 模式匹配** ——
广模式已经认领了全部文件，具体模式便"匹配不到任何函数"，报的却是上面这句
容易误导的错误（听起来像文件不存在，实际是被抢占了）。

修复：
- 合并为单条 `api/**/*.js`，`includeFiles` 挂在其上（字体+CMap 共 2.5MB，全函数携带可接受）
- 放弃 ecad 单独提到 1024MB 的内存设置 —— 它与广模式无法并存，且 512MB 本就够用

### 防止再犯
本地测试全绿仍会在 Vercel 构建失败，这类配置错误此前没有任何拦截。
现已在两处加校验，规则与 Vercel 一致（每个模式必须匹配到 ≥1 个文件、且模式之间不得重叠）：
- `scripts/check.mjs` —— `npm run check` 与 CI 都会跑
- `test/v692-fixes.test.js` —— 随 `npm test` 执行

两种失败形态（重叠 / 匹配不到）均已实测能被拦下。

测试：575 → **578 例，全部通过**。

## v6.9.4 — 候选合并崩溃（P0，v6.9.2 引入）+ 3D 渲染质量

### ① `(kept.parameters || []).filter is not a function`（立即弹出，非重试可解）
v6.9.2 新增的 candidate-merge 假设候选 `parameters` 是**数组**，
而生产管线里它是**按原型号参数 id 键控的对象映射**
（`alignLocalParams` / `fetchComponentFromAPIs` 的产物，评分层按 `parameters[paramId]` 取值）。
对象上调 `.filter` 即崩，发生在查询完成后、评分之前 —— 所以是"直接弹出"而非跑了很久。

**为什么测试全绿仍上线崩**：我的单测用数组 mock，与生产形状不符。
mock 形状必须取自真实产出代码，不能凭接口想象。

修复：合并模块重写为原生支持对象映射（键即对齐好的参数 id，按键并集合并，
无需名称匹配），数组形态保留为兜底路径；`exactMatch` 任一侧为 false 时
合并结果不得声称 exact（isAuthoritative 依赖它）；extraParams 按名称并集。
回归测试改用对象映射形状，并加"线上崩溃逐字复现"用例。

### ② 3D 模型发糊、背面管脚看不清
两个独立成因：
- **暗**：three r155 起默认物理光照单位，旧的 ambient 0.75 + 单向平行光在
  新单位下整体偏暗，且背面只有环境光。改为半球光(1.6)打底 + 主光(2.2) +
  背面补光(1.2)三面受光；`metalness .25→.08`（无环境贴图时金属面发黑，
  塑封体本应接近电介质）。
- **糊**：加载瞬间容器还在布局中，`clientWidth` 偏小，画布按小尺寸建缓冲
  再被 CSS 拉大。改用 ResizeObserver 按真实容器宽重设缓冲，挂载后立即校正，
  且只监听 window resize 抓不到的"容器自身变宽"也能触发。

测试：578 → **585 例，全部通过**。

## v6.9.5 — `detailOf is not defined`（P0）+ AI 引脚空返回 + 3D 剖分精度

### ① `detailOf is not defined`（req_mswq0cdhxf6r1i）
`detailOf` 定义在**第一个评分循环内部**，而 v6.9.0 加的"保底救回"循环
（全部候选低于淘汰线时救回 Top3）里的 mode_gate 分支也调用了它 —— 作用域外，
ReferenceError。触发条件：全部候选低分 + 救回者又被模式门槛拦下，
国产替代模式最易同时命中两条，这解释了"感觉没有任何变化" ——
v6.9.4 修的是合并崩溃，这是**同一条链路上更深处的另一个雷**。

修复：淘汰详情构造器提出为循环外的 `buildDetail(result)`，
顺带把两处重复的 `elimDetail` 也统一进去。已 A/B 验证：
旧作用域在该路径逐字复现崩溃，新代码正常走到 mode_gate 淘汰。

### ② AI 推断引脚一直"按约定返回空"
根因在 callGemini 自己的注释里：**useSearch=true 时不关 thinking**，
而 2.5-flash 的思考会吃光 token 导致空响应。v6.9.2 把引脚查询切到联网检索，
4096 预算被思考+检索引用耗尽 → 输出空 → 命中 EMPTY 拒绝。

修复为两段式：先联网检索（预算提到 8192），空/解析失败再退回
JSON 模式（关 thinking）的模型记忆兜底；结果标注产出阶段
（grounded / memory），兜底路径给出更低可信度提示。
反幻觉统计拦截对两段同样生效。

### ③ 3D 模型发糊（真正根源不是画布分辨率）
`ReadStepFile(bytes, null)` 用 OCCT 默认 deflection，剖分很粗，
细小引脚只分到几个三角形 —— 这才是"引脚糊成一片"的来源；
v6.9.4 只修了画布缓冲被 CSS 拉伸的那一半。

对齐 KiCad 3D 查看器的 OCCT 剖分设置：线性偏差=包围盒 0.05%
（bounding_box_ratio 0.0005），角度偏差 0.3rad。参数名已对照
occt-import-js 0.0.23 的 wasm 内嵌字符串逐一确认。
另加 `side:DoubleSide` —— OCCT 网格常有局部反向法线，
单面材质从外看那些面就是黑的（"整块黑板"的来源之一）。

测试：585 → **595 例，全部通过**。

### 代价说明
剖分变细 → 三角形数上升，首次解析时间与内存会增加（大模型可能 1-3 秒变 3-8 秒）。
如个别超大 STEP 解析过慢，可把 0.0005 放宽到 0.001。

## v6.9.6 — 3D 质感（IBL）+ 渲染诊断 + 页面版本自检

### 诊断先行："引脚名变了、3D 纹丝不动 + 秒出"
查证结论：3D 查看器**没有任何网格缓存**，"秒出"来自代理的 3600s 文件缓存 +
wasm 已加载（小模型解析本来快）—— 单凭速度无法断定新旧。但 v6.9.4/6.9.5 的
光照与剖分改动都在**前端 bundle** 里，若标签页是部署前开着的（SPA 不会重拉
index.html），后端行为（引脚名）更新可见、前端行为（3D）纹丝不动 —— 与现象完全吻合。

### ① 渲染诊断行（让页面自己举证）
ready 行改为：`已渲染 N 网格 · N 三角形 · 解析 Nms · vX.Y.Z`。
- 三角形数：默认粗剖分通常数千，0.0005 精剖分数万起 —— 一眼判断剖分是否生效
- 版本号：截图即可判断跑的是不是新 bundle
- 环境贴图失败时明示"质感降级"

### ② 环境贴图（IBL）—— KiCad 观感的关键一步
MeshStandardMaterial 是 PBR 材质，没有环境反射时金属/半光泽面又平又暗；
KiCad 3D 查看器的"质感"正来自环境反射。接入 three 官方 RoomEnvironment +
PMREMGenerator 生成室内环境；CDN 失败自动降级回纯直射光（不阻断渲染）。
修正装配顺序：renderer 必须先于 PMREMGenerator 创建（原插入点是 TDZ 崩溃）。
pmrem 随视图销毁释放。

### ③ 页面版本自检（结构性防线）
这是第二次"后端已部署、页面跑旧 bundle"。挂载时对比 /api/health 的服务端
版本，落后即顶部横幅提示"部分修复未生效"并给刷新按钮。

测试：595 → **603 例，全部通过**。
（v6.9.2 的"全文无版本号"断言收窄为"页头页脚无版本号" —— 诊断行与
落后横幅中的版本号是功能信息。）

## v6.9.7 — 3D 呈现对齐 SamacSys（诊断行给出的结论）

诊断行数据：**524 三角形 / 31 网格 ≈ 每网格 12 个三角形** —— 该 STEP 本身就是
一堆长方体（本体 + 28 引脚 + 焊盘）。剖分精度只作用于曲面，对平面盒无效；
v6.9.5 的"剖分粗糙"诊断对这类 box 几何不适用（对曲面 BREP 仍然正确）。
真正的问题是**呈现**：单一灰色 + 无边线，盒子互相糊掉。

对照用户提供的 SamacSys 查看器截图，其清晰度来自两点，均已实现：
1. **本体/引脚分材质**（体积启发式：最大网格=塑封本体，深色哑光；
   其余=引脚/焊盘，亮银金属 metalness .85 —— IBL 已就位，金属度回升是安全的）。
   STEP 自带 ≥2 种颜色时尊重原色，单色/无色才用启发式。
2. **棱线**（EdgesGeometry 25° 阈值，半透明深灰）。超过 20 万三角形自动关闭，
   避免大模型线段数爆炸。销毁时逐一释放几何与材质（边线让几何对象翻倍）。

测试：603 → **609 例，全部通过**。
（v6.9.4 的统一 metalness:.08 断言更新为分材质断言。）

## v6.9.8 — 3D 渲染调性对齐 SamacSys

AD8331（4,572 三角形）证明曲面剖分、分材质、棱线均已生效；
与 SamacSys 的剩余差距在**渲染调性**：画面发灰发平、引脚不够亮、本体不够黑。

主因：three 默认 **NoToneMapping**，IBL 场景下高光被硬截、中间调发灰。
- 开启 ACESFilmicToneMapping（曝光 1.15）+ 显式 SRGBColorSpace —— 单项最大提升
- 本体 0x3a3f45→0x2e3237、roughness .7→.82（更黑更哑）
- 引脚 0xc8ccd2→0xd5d8dc、metalness .9、roughness .28、envMapIntensity 1.25（亮银抛光）
- 棱线阈值 25°→30°、透明度 .5→.3（海鸥翼曲面在低阈值下出碎线）
- ACES 压暗补偿：半球光相应回调

测试治理：v6.9.7/v6.9.2 曾把材质数值写死进断言，每调一次视觉参数就断一次历史
测试。历史断言收敛为"结构存在"（分材质、棱线机制在），**具体数值只由最新版
测试约束** —— 视觉调参不再破坏历史用例。

测试：609 → **613 例，全部通过**。

## v6.9.9 — 引脚计数误拒（结构化拒绝理由直接定位）

页面提示自己说明了问题："AI 给出 19 个，封装标称 20 个"。
根因是 v6.9.2 的 EP 排除规则**只看名字**：AI 把编号在 1..20 内的某脚命名为
"EP" 时，该脚被踢出编号计数 → 19≠20 → 整份误拒（AD8331ARQZ 线上命中）。

修复为**编号覆盖**语义：编号落在封装范围内的脚，无论叫什么都占一个编号位；
只有编号超范围或编号本身为 "EP"/"PAD" 的附加焊盘才不占位。
判定同时更严：要求 1..pinCount 编号**齐全**（此前只比总数，编号重复+缺失
可互相抵消）。超范围且非 EP 的脚归入"编号异常"，保留并提示核对。

另：拒绝结果负缓存 3600s→600s —— AI 输出有随机性，长负缓存让"重试"按钮
在 1 小时内形同虚设。

测试：613 → **620 例，全部通过**（含 AD8331ARQZ 场景的逐字回归）。

## v6.9.10 — 系统自审轮（详见 SELF_AUDIT_v6.9.10.md）

按已踩过的 9 个缺陷类别做全库定向排查，8 项修复：
- **FIX-1/2** 主/救回循环共用 buildScoredEntry；清零两处无保护
  `manufacturer.toLowerCase()`；救回条目补齐 market/extraParams/dataSource 漂移
- **FIX-3/4** analyzeComponent 与 geminiMarketEstimate 的联网空响应落兜底
  （pinout 同类潜伏，只 catch 抛错不够）
- **FIX-5** recommend 入口净化 preferredManufacturers（非字符串输入曾可
  一路走到 .toLowerCase() 崩成 INTERNAL_ERROR）
- **FIX-8** comp 缓存键补参考参数指纹 —— 缓存值按当次原型号 param_1..N 对齐，
  换个原型号命中旧缓存即**评分静默错位**（silent-wrong，无任何报错）
- **FIX-6/7** image/* Content-Type 具体化；location.reload 废弃参数

审查后确认非缺陷 4 项、扫描器局限 1 项（eslint-scope 后端方案误报弃用），
均如实记录在自审报告中供外部审计交叉验证。

测试：620 → **633 例，全部通过**；两个历史崩溃复现脚本重跑通过。
