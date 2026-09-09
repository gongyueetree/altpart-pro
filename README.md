# 元件通 · PartBridge

元器件查询、设计资源下载与替代料推荐，支持中文 / English 切换。

- 本地词典覆盖菜单与常用术语；英文模式按需翻译 ezPLM 的中文描述、参数名与提示。
- 自动翻译复用 `GEMINI_API_KEY` / `GEMINI_MODEL`。无密钥或翻译失败时明确显示原文与重试提示。
- 语言偏好保存到浏览器；器件翻译仅在内存缓存，不改写数据库、评分输入或 KiCad/STEP 文件。
- 详见 [双语实现与验收](docs/PARTBRIDGE_I18N.md)。

# PartBridge

> 元器件替代决策智能体 · ezPLM 集成 · 实时行情 · 场景化替代

**v7.0.0** | 前身为 AltPart AI v2.4（旧仓库 eehubio/altpart，已停用）

---

## 核心能力

| 能力 | 说明 |
|---|---|
| **ezPLM 元器件库** | HMAC 签名调用官方 API，取真实参数、参考设计、可下载资源 |
| **实时价格库存** | DigiKey / Mouser API；未配置时 Gemini 估算并明确标注 |
| **场景化替代** | 9 种应用领域，同一器件在不同场景下推荐不同替代料 |
| **成本差异** | 每个候选相对原型号的价差与百分比 |
| **确定性评分** | 技术兼容度 × 证据覆盖率 × 来源可信度，AI 数据显著降权 |
| **引脚证据门槛** | 只有权威来源的结构化逐针映射一致，才允许标记“直接替代” |
| **封装几何门槛** | Pin-to-Pin 同时校验本体尺寸、间距、散热焊盘等几何，不只比较封装家族名 |
| **采购条件生效** | 地区、数量、包装、币种、现货条件进入报价、缓存、门槛和排序 |
| **安全边界** | 签名分析上下文、API 限流/可选鉴权、逐跳 SSRF 防护、资源限长读取 |

## 快速开始

```bash
npm i -g vercel
cp .env.example .env.local    # 填入 API Key
vercel dev                    # http://localhost:3000
```

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | AI 候选推荐与参数查询 |
| `GEMINI_MODEL` | | 默认 `gemini-2.5-flash` |
| `EZPLM_API_KEY` | 推荐 | ezPLM 元器件库（服务端持有，勿加 VITE_ 前缀） |
| `DIGIKEY_CLIENT_ID` / `_SECRET` | | 实时价格库存 |
| `MOUSER_API_KEY` | | 实时价格库存 |
| `ANALYSIS_CONTEXT_SECRET` | 生产必填 | 至少 32 字节；签名 `/analyze` 结果，防止客户端篡改参数后评分 |
| `ALTPART_REQUIRE_AUTH` | | `true` 时所有高成本接口要求 API Key |
| `ALTPART_API_KEYS` | | 逗号分隔的服务端 API Key；也用于按 Key 限流 |
| `ALTPART_ADMIN_API_KEYS` | | 管理员 Key；读取反馈记录时必需 |
| `ALTPART_RATE_LIMIT` | | 单实例每分钟成本点数，默认 60（推荐一次计 10） |
| `ALLOWED_ORIGINS` | 推荐 | 允许调用 API 的前端 Origin，逗号分隔 |

配置后需 **Redeploy** 生效。验证：访问 `/api/ezplm?path=status` 应返回 `{"configured":true}`。

## 数据流

```
输入型号
  → /api/v2/analyze     ezPLM 查参数（未收录则 Gemini 联网搜索）
  → [封装变体确认]       基础型号先选具体订货号
  → 工作台               选应用领域 / 拖拽参数优先级 / 设约束 / 选替代模式
  → /api/v2/recommend   AI 推 10 个 → ezPLM/分销商精确校验 → 硬门槛 → 加权评分 → Top5 + 数量阶梯价
  → 点击型号             /api/v2/part-detail 规格/报价/下载/参考设计
```

## API

```
POST /api/v2/analyze          解析原器件参数（含封装变体）
POST /api/v2/recommend        场景化推荐 + 成本差异
GET  /api/v2/part-detail/:pn  器件详情（规格/供应商/下载/参考设计）
POST /api/v2/market           批量实时行情
GET  /api/v2/applications     应用领域列表
GET  /api/ezplm?path=status   ezPLM 连接状态
GET  /api/health              服务健康检查
```

## 目录

```
api/
├── ezplm.js              ezPLM HMAC 签名代理
├── health.js
├── v2/                   analyze / recommend / part-detail / market / applications
└── _lib/
    ├── ezplm.js          ezPLM 数据层（防御式字段映射）
    ├── market.js         DigiKey/Mouser + Gemini 兜底
    ├── applications.js   9 种应用场景规则
    ├── pipeline.js       推荐流程编排
    ├── scoring-node.js   三段式评分引擎
    ├── units.js          单位归一化
    └── gemini.js         Gemini 调用（thinking 关闭 + JSON 容错）
public/index.html         前端（单文件 React）
```

## 已知限制

- ezPLM 官方仅开放 `parts` / `reference-designs` 两个只读端点，暂无内部库存、内部编号、BOM 写回
- 缓存与反馈存于函数内存，冷启动清空；生产需接 Vercel KV
- 单次推荐含多次 AI 调用，约 10–30 秒
