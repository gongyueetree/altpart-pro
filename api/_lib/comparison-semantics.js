// comparison-semantics.js — 参数比较语义
//
// 此前所有数值参数一律按"越接近越好"处理，导致：
//   耐压 30V → 候选 100V 被判"差距显著"扣到 25 分（实际是更优的替代）
//   静态电流 700µA → 候选 50µA 被扣分（实际是更优）
// 比较方向必须由参数语义决定，而非统一的接近度。

const SEMANTICS = [
  "exact",           // 必须完全相同（引脚数、通道数、位数）
  "range_cover",     // 候选范围需覆盖原型号范围（工作电压、温度）
  "higher_better",   // 越高越好，不低于原值即满分（耐压、额定电流、带宽）
  "lower_better",    // 越低越好，不高于原值即满分（静态电流、失调、噪声、Rds(on)）
  "nearest",         // 越接近越好（价格、标称值）
  "compatible_set",  // 兼容集合（封装家族、接口）
  "conditioned",     // 带测试条件，条件不同不得直接比较
  "boolean",         // 是/否
  "enum",            // 枚举取值
  "text_match",      // 文本匹配
];

/**
 * 参数名 → 比较语义规则表
 * tolerance：允许的相对劣化比例（higher/lower_better 用于判定"略差但可接受"）
 */
const RULES = [
  // ── exact ──
  { re: /引脚数|pin\s*count|number\s*of\s*pins|通道数|channels?|number\s*of\s*channels|位数|分辨率|resolution|bits?\b/i,
    semantics: "exact" },
  { re: /极性|polarity|类型|^type$|拓扑|topology|内核|core\b/i, semantics: "exact" },

  // ── range_cover ──
  { re: /工作温度|operating\s*temp|temperature\s*range|温度范围/i, semantics: "range_cover" },
  { re: /工作电压|供电电压|supply\s*voltage|operating\s*voltage|输入电压范围|input\s*voltage\s*range|vs跨度/i,
    semantics: "range_cover" },
  { re: /共模输入范围|input\s*common[- ]?mode|输出摆幅|output\s*swing/i, semantics: "range_cover" },

  // ── higher_better（更高即更优，不低于原值满分）──
  { re: /vds\s*\(?max\)?|耐压|breakdown|击穿|最大输入电压|absolute\s*max/i, semantics: "higher_better", tolerance: 0.05 },
  { re: /id\s*\(?max\)?|额定电流|输出电流|output\s*current|max\s*current|连续电流/i, semantics: "higher_better", tolerance: 0.05 },
  { re: /带宽|bandwidth|gbw|gain\s*bandwidth|增益带宽积|-3db/i, semantics: "higher_better", tolerance: 0.15 },
  { re: /压摆率|slew\s*rate\b/i, semantics: "higher_better", tolerance: 0.20 },
  { re: /采样率|sample\s*rate|update\s*rate|throughput|主频|clock\s*freq|max\s*frequency|cpu\s*freq/i,
    semantics: "higher_better", tolerance: 0.10 },
  { re: /flash|sram|ram容量|memory\s*size|存储容量|eeprom/i, semantics: "higher_better", tolerance: 0 },
  { re: /cmrr|psrr|snr|sinad|信噪比|共模抑制|电源抑制/i, semantics: "higher_better", tolerance: 0.05 },
  { re: /效率|efficiency/i, semantics: "higher_better", tolerance: 0.05 },
  { re: /esd|静电/i, semantics: "higher_better", tolerance: 0 },
  { re: /gpio|i\/o\s*数量|number\s*of\s*i\/?os|定时器|timers?\b/i, semantics: "higher_better", tolerance: 0 },

  // ── lower_better（更低即更优）──
  { re: /rds\s*\(?on\)?|导通电阻/i, semantics: "conditioned", inner: "lower_better", tolerance: 0.20 },
  { re: /压差|dropout/i, semantics: "conditioned", inner: "lower_better", tolerance: 0.20 },
  { re: /静态电流|quiescent|\biq\b|待机电流|shutdown\s*current|关断电流/i, semantics: "lower_better", tolerance: 0.30 },
  { re: /失调电压|offset\s*voltage|\bvos\b/i, semantics: "lower_better", tolerance: 0.50 },
  { re: /偏置电流|bias\s*current|\bib\b|漏电流|leakage/i, semantics: "lower_better", tolerance: 0.50 },
  { re: /噪声|noise\b/i, semantics: "lower_better", tolerance: 0.25 },
  { re: /功耗|power\s*(consumption|dissipation)|thd|失真|inl|dnl|温漂|drift/i, semantics: "lower_better", tolerance: 0.25 },
  { re: /qg\b|栅电荷|gate\s*charge|响应时间|response\s*time|延迟|latency/i, semantics: "lower_better", tolerance: 0.25 },

  // ── nearest（数值应接近）──
  { re: /参考价格|price|单价/i, semantics: "nearest", tolerance: 0.50 },
  { re: /输出电压|output\s*voltage|基准电压|reference\s*voltage/i, semantics: "nearest", tolerance: 0.02 },
  { re: /增益[^带]|^gain|阻值|resistance|容值|capacitance|电感|inductance/i, semantics: "nearest", tolerance: 0.10 },
  { re: /开关频率|switching\s*freq/i, semantics: "nearest", tolerance: 0.30 },

  // ── compatible_set ──
  { re: /封装|package|footprint|case/i, semantics: "compatible_set" },
  { re: /接口|interface|通信|protocol|总线|bus\b/i, semantics: "compatible_set" },

  // ── boolean / enum ──
  { re: /轨到轨|rail[- ]?to[- ]?rail|车规|aec-?q|无卤|rohs/i, semantics: "boolean" },
  { re: /控制模式|control\s*mode|等级|grade|特性|features?/i, semantics: "enum" },
];

/** 判定参数的比较语义 */
function semanticsOf(paramName, paramNameEn) {
  const t = `${paramName || ""} ${paramNameEn || ""}`;
  for (const r of RULES) {
    if (r.re.test(t)) return { semantics: r.semantics, inner: r.inner, tolerance: r.tolerance ?? 0.15 };
  }
  return { semantics: "nearest", tolerance: 0.15 };   // 兜底
}

/** 封装兼容族 */
const PKG_COMPAT = {
  "SOIC-8": ["SOP-8", "SO-8", "SOIC8"], "SOP-8": ["SOIC-8", "SO-8"],
  "SOT-23-5": ["SOT-23-5L", "SC-74A", "SOT23-5"], "SOT23-5": ["SOT-23-5"],
  "SOT-23-6": ["SOT-26"], "SSOP-28": ["TSSOP-28"], "TSSOP-28": ["SSOP-28"],
  "DIP-8": ["PDIP-8"], "PDIP-8": ["DIP-8"],
  "LQFP-48": ["TQFP-48", "QFP-48"], "TQFP-48": ["LQFP-48"],
  "LQFP-64": ["TQFP-64"], "LQFP-100": ["TQFP-100"],
  "QFN-16": ["WQFN-16", "DFN-16"], "MSOP-8": ["VSSOP-8"],
};

/** 封装名归一（去尺寸后缀，便于家族比较） */
function pkgFamily(name) {
  return String(name || "").toUpperCase().replace(/_.*$/, "").replace(/\s*\(.*\)$/, "").trim();
}

module.exports = { SEMANTICS, semanticsOf, PKG_COMPAT, pkgFamily };
