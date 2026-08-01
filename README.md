# AltPart Pro

> 元器件替代决策智能体 · ezPLM 集成 · 实时行情 · 场景化替代

**v3.0** | 前身为 AltPart AI v2.4（旧仓库 eehubio/altpart，已停用）

---

## 核心能力

| 能力 | 说明 |
|---|---|
| **ezPLM 元器件库** | HMAC 签名调用官方 API，取真实参数、参考设计、可下载资源 |
| **实时价格库存** | DigiKey / Mouser API；未配置时 Gemini 估算并明确标注 |
| **场景化替代** | 9 种应用领域，同一器件在不同场景下推荐不同替代料 |
| **成本差异** | 每个候选相对原型号的价差与百分比 |
| **确定性评分** | 技术兼容度 × 证据覆盖率 × 来源可信度，AI 数据显著降权 |
| **引脚证据门槛** | 无引脚验证不标"可直接替换"，只标 P2 候选 |

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

配置后需 **Redeploy** 生效。验证：访问 `/api/ezplm?path=status` 应返回 `{"configured":true}`。

## 数据流

```
输入型号
  → /api/v2/analyze     ezPLM 查参数（未收录则 Gemini 联网搜索）
  → [封装变体确认]       基础型号先选具体订货号
  → 工作台               选应用领域 / 拖拽参数优先级 / 设约束 / 选替代模式
  → /api/v2/recommend   AI 推 10 个 → ezPLM 校验 → 评分淘汰 → Top5 + 成本差异
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
