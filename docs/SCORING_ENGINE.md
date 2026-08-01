# 评分引擎（v6.0）

## 为什么重写

v5.5 存在四个正确性缺陷（均已有回归测试）：

| 缺陷 | 表现 | 根因 |
|---|---|---|
| 跨单位误判 | 72 MHz vs 72,000,000 Hz → "差距显著"10分 | 候选裸值套用原型号单位 |
| 更优候选被扣分 | 耐压 30V→100V 得 25 分 | 所有数值参数一律"越接近越好" |
| 更低更优被扣分 | 静态电流 700µA→50µA 得 59 分 | 同上 |
| 条件参数直接比较 | Rds(on)@10V vs @4.5V 直接比数值 | 未解析测试条件 |

## 三层结构

```
quantity.js              QuantityIR：解析 → 规范单位 → 条件
comparison-semantics.js  参数 → 比较语义（10 种）
scoring-node.js          比较 → 约束 → 等级判定
```

### QuantityIR

原型号与候选**各自独立**解析，不共用单位：

```js
toQuantityIR("72", "MHz")        → { canonicalTyp: 72000000, dim:"frequency", canonicalUnit:"Hz" }
toQuantityIR("72000000 Hz", "")  → { canonicalTyp: 72000000, dim:"frequency", canonicalUnit:"Hz" }
toQuantityIR("12 mΩ @ Vgs=10V")  → { canonicalTyp: 0.012, condition:{Vgs:"10V"} }
```

量纲不一致的两个量**拒绝比较**（`comparable()` 返回 false），落回文本比较。

存储容量区分 SI 与 binary：`KB=1000B`，`KiB=1024B`。

### 比较语义

| 语义 | 判定 | 典型参数 |
|---|---|---|
| `exact` | 必须相同 | 引脚数、通道数、位数、内核 |
| `range_cover` | 候选范围需覆盖原范围**端点** | 工作温度、工作电压 |
| `higher_better` | ≥原值即 100 分 | 耐压、额定电流、带宽、Flash、CMRR |
| `lower_better` | ≤原值即 100 分 | 静态电流、失调、噪声、功耗、Qg |
| `nearest` | 越接近越好 | 价格、输出电压、阻容值 |
| `compatible_set` | 兼容族 | 封装、接口 |
| `conditioned` | 条件不同不比数值 | Rds(on)@Vgs、Dropout@Iout |
| `boolean` / `enum` / `text_match` | — | 轨到轨、控制模式 |

未命中规则的参数兜底为 `nearest`。

### 约束语义

```
mode="cover"   候选范围必须覆盖 [min,max]   ← 温度/电压等范围参数默认
mode="within"  候选值必须落在 [min,max] 内  ← 价格上限等单值参数默认
```

判定结果三态：

```
true  → 满足
false → 违反 → 硬约束时 REJECTED
null  → 值缺失 → 硬约束时 NEEDS_VERIFICATION（不再静默放行）
```

## 输出

```js
{
  technical,          // 技术兼容度（仅已知参数加权平均）
  evidenceCoverage,   // 证据覆盖率（已知/应有，按权重）
  sourceConfidence,   // 数据来源可信度（ezPLM 1.0 … AI 0.45）
  confidence,         // 结论可信度 = 技术 × 覆盖率 × (0.4+0.6×来源)
  rejected, rejectReason,
  needsVerification, verifyReasons,
  replacementLevel,   // 见下
  paramScores[]       // 每参数：分数/语义/条件冲突/来源
}
```

四个指标**分开呈现**，不压缩成单一总分。

## 推荐等级

```
DIRECT_REPLACEMENT      引脚映射已验证 + 高可信
COMPATIBLE_WITH_REVIEW  参数匹配但引脚未验证
FUNCTIONAL_ALTERNATIVE  功能满足，需改固件/改板
REDESIGN_REQUIRED       仅适合新设计
NEEDS_VERIFICATION      硬约束缺失 / 证据不足 / 型号未验证
NOT_RECOMMENDED         关键不兼容
REJECTED                硬约束违反
```

**无 Pin Map 证据时永远不会输出 `DIRECT_REPLACEMENT`。**

## 测试

```bash
npm test    # 133 例
```
