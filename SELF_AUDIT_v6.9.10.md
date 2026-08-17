# AltPart Pro v6.9.10 — 自审报告（送外部审计前）

审计方式：不按文件顺序读代码，而按**本项目已踩过的缺陷类别**做全库定向排查。
每类给出扫描方法、命中、处置。误报与"审查后确认无问题"的条目如实保留，
供外部审计（GPT）交叉验证，避免重复劳动。

---

## 扫描类别与结果总览

| # | 类别（来源教训） | 扫描方法 | 命中 | 处置 |
|---|---|---|---|---|
| 1 | 作用域错位（detailOf） | eslint-scope 全后端未定义引用 | 工具误报 275 处 | **扫描器弃用**，见"方法论备注" |
| 2 | 形状/空值崩溃（.filter is not a function） | 定向 grep 无保护链式调用 | **2 处真命中** | FIX-1 |
| 3 | 重复装配块漂移（PCB currency） | 主/救回循环字段 diff | **3 字段漂移** | FIX-2 |
| 4 | 联网空响应（pinout 空返回） | callGemini 全调用点审计 | **2 处同类潜伏** | FIX-3/4 |
| 5 | 缓存键缺输入（重新推荐无变化） | 全部 cache 键构成审查 | **1 处 silent-wrong** | FIX-8 |
| 6 | `\|\| list[0]` 兜底（液位传感器） | 定向 grep | 1 处，审查后**非缺陷** | 记录 |
| 7 | res 漏 return / 双发 | 粗启发式 | 2 处，均为 handler 末行**误报** | 记录 |
| 8 | 输入未净化 | recommend 入口审查 | **1 处** | FIX-5 |
| 9 | 杂项 | — | 2 处 | FIX-6/7 |

测试：620 → **632 例全部通过**；两个历史崩溃复现脚本（detailOf 路径、
候选合并路径）在修复后代码上重跑通过。

---

## 修复明细

### FIX-1（P1·崩溃）pipeline 两处 `cand.manufacturer.toLowerCase()` 无保护
`manufacturer` 为 undefined（旧缓存条目、异常上游）时 TypeError →
又一个 INTERNAL_ERROR 源。已并入 FIX-2 的共享装配器统一防护（空串不算命中）。

### FIX-2（P1·漂移根治）主循环与救回循环共用 `buildScoredEntry`
两处各自手写 scored 对象字面量，已漂移出三个字段差异：
救回条目**缺 market、缺 extraParams、dataSource 不认 digikey/mouser**。
与 PCB Quote 的 currency 教训同类 —— 单一装配器根治，救回条目通过
`extra` 参数附加 `_lowConfidence`。

### FIX-3（P1·潜伏）analyzeComponent 联网空响应不落兜底
只 catch 抛错不够：2.5-flash 联网模式不关 thinking，预算被吃光时返回
**空文本而非抛错**（pinout 已线上验证过此形态）。空/解析失败现同样落入
模型知识模式兜底。

### FIX-4（P1·潜伏）geminiMarketEstimate 同类修复
同上；`!data?.parts` 即兜底。

### FIX-5（P2·健壮性）recommend 入口净化 preferredManufacturers
非数组/含非字符串时，此前一路走到 `.toLowerCase()` 才崩。
现 `String().trim().filter(Boolean).slice(0,10)`。

### FIX-8（P1·silent-wrong）comp 缓存键补参考参数指纹
`comp:${pn}` 缓存的候选参数按**当次原型号**的 param_1..N 位置对齐，
键里却只有候选型号：同一候选换个原型号命中旧缓存，param_1 语义已变
→ **评分静默错位，无任何报错**。键现追加参考参数集指纹
（id+归一化名的散列），不同原型号各存各的。

### FIX-6（P3）ezplm-resource 的 `image/*` 不是合法 Content-Type
那是 Accept 语法；已映射到具体 MIME。

### FIX-7（P3）`location.reload(true)` 布尔参已废弃
移除参数。

---

## 审查后确认非缺陷（供外部审计免查）

1. **ezplm.js `pool[0]` 兜底**：处在变体确认流程内 —— 结果带
   `needsVariantConfirm:true` 且同时保留 `requestedMpn`，是"给用户确认的
   候选"而非静默替换数据，与液位传感器缺陷（无条件采信搜索第一条）不同类。
2. **health.js / applications.js 的 res.json 无 return**：均为 handler
   最后一条语句，无后续代码。
3. **candidate-merge 空 partNumber 键碰撞**：入口已
   `if (!cand.partNumber) continue` 过滤。
4. **cache 键 `market:${pn}` / `pinout:${pn}:${pinCount}` /
   `ez:search:${kw}:${pageSize}`**：值不依赖键外输入，无 FIX-8 同类问题。

## 方法论备注（诚实记录）

- 类别 1 的后端 eslint-scope 扫描器产生 275 处误报（函数声明提升未被正确
  解析），**已弃用**。该类缺陷目前的防线：端到端复现测试
  （`test/v695-fixes.test.js` 的 stub-pipeline 用例真实执行两个历史崩溃路径）。
  外部审计如有可靠的作用域静态检查方案，欢迎替换。
- 类别 2/6/7 的 grep 启发式覆盖不完备（只匹配已知书写形态），
  不能证明"无同类问题"，只能证明"已知形态无残留"。
- 前端（2500 行 JSX）本轮只过了未定义引用与本报告涉及的改动点，
  未做逐组件审查；已知薄弱点：Step3DViewer 异步 setState 无 unmount 守卫
  （React 18 下无害告警级）、导出函数未覆盖 pendingVerification 之外的新字段。
