// scoring-node.js — v6.0 评分引擎
//
// 相对 v5.5 的关键修复：
//  1. 原型号与候选各自解析为 QuantityIR，不再"候选裸值 + 原型号单位"
//     （此前 72 MHz vs 72,000,000 Hz 被判为差距显著）
//  2. 比较方向由参数语义决定（higher_better / lower_better / range_cover / exact ...）
//     （此前耐压 30V→100V、静态电流 700µA→50µA 这类"更优"候选被扣分）
//  3. 硬约束缺失不再绕过：缺失 → NEEDS_VERIFICATION，不进正常排名
//  4. 带测试条件的参数（Rds(on)@Vgs）条件不同时不直接比较

const { toQuantityIR, comparable, conditionMatch } = require("./quantity");
const { semanticsOf, PKG_COMPAT, pkgFamily } = require("./comparison-semantics");

/**
 * 约束合法性校验（后端必须再校验一次，不能只信前端）
 * @returns {valid:boolean, error?:string}
 */
function validateConstraint(con, param) {
  if (!con || !con.constraintType) return { valid: true };
  if (!["hard", "soft", "none"].includes(con.constraintType))
    return { valid: false, error: `未知约束类型：${con.constraintType}` };
  const sem = semanticsOf(param?.name || "", param?.nameEn || "").semantics;
  const isNumeric = !["compatible_set", "enum", "boolean", "text_match"].includes(sem);

  if (!isNumeric && (con.min != null || con.max != null))
    return { valid: false, error: `参数「${param?.name}」为${sem === "boolean" ? "布尔" : "离散"}类型，不支持最小/最大值约束，请使用可选值集合` };

  if (con.min != null && con.max != null) {
    const lo = toQuantityIR(String(con.min), param?.unit);
    const hi = toQuantityIR(String(con.max), param?.unit);
    // 约束端点必须是可比较的数值；纯文本（isText）不算
    if (!lo.known || lo.isText || lo.canonicalTyp === undefined)
      return { valid: false, error: `最小值「${con.min}」不是有效数值` };
    if (!hi.known || hi.isText || hi.canonicalTyp === undefined)
      return { valid: false, error: `最大值「${con.max}」不是有效数值` };
    if (lo.canonicalTyp > hi.canonicalTyp)
      return { valid: false, error: `最小值(${con.min})不得大于最大值(${con.max})` };
  }
  for (const [k, label] of [["min", "最小值"], ["max", "最大值"]]) {
    if (con[k] == null) continue;
    const q = toQuantityIR(String(con[k]), param?.unit);
    if (!q.known || q.isText || q.canonicalTyp === undefined)
      return { valid: false, error: `${label}「${con[k]}」不是有效数值` };
  }
  if (Array.isArray(con.options) && !con.options.length)
    return { valid: false, error: "可选值集合不能为空" };
  return { valid: true };
}

/* ── 数据来源可信度 ── */
const SOURCE_CONFIDENCE = {
  ezplm: 1.0, manual: 1.0, manufacturer: 0.98, datasheet: 0.95,
  digikey: 0.85, mouser: 0.85, "digikey+mouser": 0.88, lcsc: 0.8,
  kicad: 0.8, third_party: 0.6,
  ai_lookup: 0.45, ai_search: 0.45, ai_pinout: 0.35, ai: 0.45,
  "": 0.0,
};

/* ── 推荐等级 ── */
const LEVELS = {
  DIRECT_REPLACEMENT:   { level: "DIRECT_REPLACEMENT",   label: "直接替代",     color: "#1a6c4e" },
  COMPATIBLE_WITH_REVIEW:{ level: "COMPATIBLE_WITH_REVIEW", label: "兼容(待复核)", color: "#2d9d6f" },
  FUNCTIONAL_ALTERNATIVE:{ level: "FUNCTIONAL_ALTERNATIVE", label: "功能替代",   color: "#c2610c" },
  REDESIGN_REQUIRED:    { level: "REDESIGN_REQUIRED",    label: "需改板/改固件", color: "#b8860b" },
  NEEDS_VERIFICATION:   { level: "NEEDS_VERIFICATION",   label: "待核验",       color: "#8a8a8a" },
  NOT_RECOMMENDED:      { level: "NOT_RECOMMENDED",      label: "不推荐",       color: "#c0392b" },
  REJECTED:             { level: "REJECTED",             label: "已排除",       color: "#c0392b" },
};

const CRITICAL_IDENTITY = /封装|package|内核|core\b|通道数|channels?|分辨率|resolution|类型|^type$|极性|polarity|拓扑|topology/i;

/* ── 单参数比较 ── */
/**
 * @returns {score:0..100|null, comment, known, semantics, conditionMismatch}
 */
function compareParam(origParam, candRaw, candMeta = {}) {
  const name = origParam.name || "", nameEn = origParam.nameEn || "";
  const rule = semanticsOf(name, nameEn);
  const unitHint = origParam.unit || "";

  const a = toQuantityIR(origParam.value, unitHint, { sourceType: origParam.source });
  const b = toQuantityIR(candRaw, unitHint, { sourceType: candMeta.source, confidence: candMeta.confidence });

  if (!b.known) return { score: null, comment: "未提供", known: false, semantics: rule.semantics };

  // 带条件参数：条件不同不得直接比较
  let sem = rule.semantics, inner = rule.inner;
  let conditionMismatch = null;
  if (sem === "conditioned") {
    const cm = conditionMatch(a, b);
    if (cm.checked && !cm.same) conditionMismatch = cm.reason;
    sem = inner || "lower_better";
  }

  const textCompare = () => {
    const av = String(a.text ?? a.rawValue ?? "").trim().toLowerCase();
    const bv = String(b.text ?? b.rawValue ?? "").trim().toLowerCase();
    if (!av) return { score: 60, comment: "原型号无此参数", known: true };
    if (av === bv) return { score: 100, comment: "一致", known: true };
    if (av.includes(bv) || bv.includes(av)) return { score: 85, comment: "基本一致", known: true };
    return { score: 15, comment: "不匹配", known: true };
  };

  let out;
  switch (sem) {
    case "exact": {
      if (comparable(a, b)) {
        out = a.canonicalTyp === b.canonicalTyp
          ? { score: 100, comment: "一致", known: true }
          : { score: 10, comment: `不一致（${fmt(a)} vs ${fmt(b)}）`, known: true };
      } else out = textCompare();
      break;
    }
    case "range_cover": {
      if (a.isRange && b.isRange && comparable(a, b)) {
        if (b.canonicalMin <= a.canonicalMin && b.canonicalMax >= a.canonicalMax)
          out = { score: 100, comment: "完全覆盖", known: true };
        else {
          const span = Math.abs(a.canonicalMax - a.canonicalMin) || 1;
          const short = Math.max(0, a.canonicalMin - b.canonicalMin < 0 ? b.canonicalMin - a.canonicalMin : 0)
                      + Math.max(0, a.canonicalMax - b.canonicalMax);
          const r = short / span;
          out = r <= 0.05 ? { score: 88, comment: "基本覆盖", known: true }
              : r <= 0.25 ? { score: 55, comment: "部分覆盖", known: true }
              : { score: 15, comment: "范围不足", known: true, rangeFail: true };
        }
      } else if (comparable(a, b)) {
        // 一方非范围：以数值落点判断
        out = (b.canonicalTyp >= (a.canonicalMin ?? a.canonicalTyp) && b.canonicalTyp <= (a.canonicalMax ?? a.canonicalTyp))
          ? { score: 90, comment: "在范围内", known: true }
          : { score: 45, comment: "超出范围", known: true };
      } else out = textCompare();
      break;
    }
    case "higher_better":
    case "lower_better": {
      if (!comparable(a, b)) { out = textCompare(); break; }
      const better = sem === "higher_better" ? b.canonicalTyp >= a.canonicalTyp : b.canonicalTyp <= a.canonicalTyp;
      if (better) {
        const improved = Math.abs(b.canonicalTyp - a.canonicalTyp) > Math.abs(a.canonicalTyp || 1) * 1e-9;
        out = { score: 100, comment: improved ? "优于原型号" : "一致", known: true, better: improved };
      } else {
        const denom = Math.abs(a.canonicalTyp) || 1;
        const worse = Math.abs(b.canonicalTyp - a.canonicalTyp) / denom;   // 劣化比例
        const tol = rule.tolerance || 0.15;
        out = worse <= tol * 0.5 ? { score: 88, comment: "略低于原型号", known: true }
            : worse <= tol       ? { score: 72, comment: "低于原型号但在容差内", known: true }
            : worse <= tol * 2.5 ? { score: 45, comment: "明显低于原型号", known: true }
            : { score: 15, comment: `不满足（${fmt(a)} → ${fmt(b)}）`, known: true };
      }
      break;
    }
    case "compatible_set": {
      const av = pkgFamily(a.text ?? a.rawValue), bv = pkgFamily(b.text ?? b.rawValue);
      if (!av) { out = { score: 60, comment: "原型号未标注", known: true }; break; }
      if (av === bv) { out = { score: 100, comment: "一致", known: true }; break; }
      const compat = PKG_COMPAT[String(a.rawValue).trim()] || PKG_COMPAT[av] || [];
      if (compat.some(c => bv.includes(pkgFamily(c)))) { out = { score: 80, comment: "同兼容族(引脚待核)", known: true }; break; }
      if (av.includes(bv) || bv.includes(av)) { out = { score: 70, comment: "疑似兼容(需确认)", known: true }; break; }
      out = { score: 12, comment: "不兼容", known: true };
      break;
    }
    case "boolean": {
      const truthy = v => /^(y|yes|true|是|支持|有|rail-?to-?rail)/i.test(String(v || "").trim());
      out = truthy(a.rawValue) === truthy(b.rawValue)
        ? { score: 100, comment: "一致", known: true } : { score: 30, comment: "不一致", known: true };
      break;
    }
    case "enum": case "text_match": out = textCompare(); break;
    case "nearest":
    default: {
      if (!comparable(a, b)) { out = textCompare(); break; }
      const denom = Math.abs(a.canonicalTyp) || 1;
      const d = Math.abs(b.canonicalTyp - a.canonicalTyp) / denom;
      const tol = rule.tolerance || 0.15;
      out = d <= 0.005 ? { score: 100, comment: "一致", known: true }
          : d <= tol      ? { score: 92, comment: "接近", known: true }
          : d <= tol * 2  ? { score: 78, comment: "可接受", known: true }
          : d <= tol * 4  ? { score: 55, comment: "有差异", known: true }
          : { score: 20, comment: "差距显著", known: true };
    }
  }

  out.semantics = sem;
  out.conditionMismatch = null;
  if (conditionMismatch) {
    // 条件不同 → 不能按数值直接下结论，降级为待确认
    out.score = Math.min(out.score ?? 60, 55);
    out.comment = "测试条件不一致，需人工核对";
    out.conditionMismatch = conditionMismatch;
  }
  return out;
}

function fmt(q) {
  if (!q?.known) return "N/A";
  const v = q.isRange ? `${q.min}~${q.max}` : (q.value ?? q.typ);
  return `${v}${q.unit ? " " + q.unit : ""}`;
}

/* ── 主评分 ── */
function calculateScore(originalParams, candidate, priorityOrder, constraints = {}, opts = {}) {
  const paramScores = [];
  let rejected = false, rejectReason = "";
  let needsVerification = false; const verifyReasons = [];
  let criticalFail = false;

  let techW = 0, techSum = 0;
  let covW = 0, covKnownW = 0;
  let srcW = 0, srcSum = 0;
  let pinVerified = !!candidate.pinVerified;

  priorityOrder.forEach((paramId, index) => {
    const origP = originalParams.find(p => p.id === paramId);
    if (!origP) return;
    const weight = priorityOrder.length - index;
    const cv = candidate.parameters?.[paramId];
    const res = compareParam(origP, cv?.value, cv || {});

    // ── 约束检查（缺失值不再绕过）──
    const con = constraints[paramId];
    if (con && con.constraintType) {
      const isHard = con.constraintType === "hard";
      if (!res.known) {
        if (isHard) { needsVerification = true; verifyReasons.push(`硬约束参数「${origP.name}」缺失，无法验证`); }
        // 软偏好缺失只影响证据覆盖率（下方 covKnownW 自然不计入）
      } else {
        const pass = checkConstraint(con, cv?.value, origP.unit);
        if (!pass && isHard) { rejected = true; rejectReason = `不满足硬约束：${origP.name}`; }
        if (!pass && !isHard) { res.score = Math.max(0, (res.score ?? 60) - 25); res.comment = "不满足偏好"; }
      }
    }

    if (res.known && res.score !== null && res.score < 40 && CRITICAL_IDENTITY.test(`${origP.name} ${origP.nameEn || ""}`)) {
      criticalFail = true;
    }
    if (res.rangeFail) { rejected = rejected || !!opts.rejectOnRangeFail; if (opts.rejectOnRangeFail) rejectReason = rejectReason || `范围不覆盖：${origP.name}`; }

    if (res.known) {
      techW += weight; techSum += res.score * weight;
      const sc = SOURCE_CONFIDENCE[cv?.source] ?? 0.45;
      srcW += weight; srcSum += sc * weight;
    }
    covW += weight; if (res.known) covKnownW += weight;

    paramScores.push({
      paramId, paramName: origP.name, paramNameEn: origP.nameEn,
      origValue: origP.value, origUnit: origP.unit,
      value: res.known ? cv?.value : "N/A", unit: cv?.unit || origP.unit || "",
      score: res.known ? res.score : null, comment: res.comment, known: res.known,
      semantics: res.semantics, better: !!res.better,
      conditionMismatch: res.conditionMismatch || null,
      source: cv?.source || "", sourceLabel: cv?.sourceLabel || "",
      confidence: cv?.confidence || (res.known ? "medium" : "none"),
    });
  });

  const technical = techW ? Math.round(techSum / techW) : 0;
  const evidenceCoverage = covW ? Math.round((covKnownW / covW) * 100) : 0;
  const sourceConfidence = srcW ? srcSum / srcW : 0;

  let confidence = Math.round(technical * (evidenceCoverage / 100) * (0.4 + 0.6 * sourceConfidence));
  if (evidenceCoverage < 50) confidence = Math.min(confidence, 60);
  if (sourceConfidence < 0.5) confidence = Math.min(confidence, 70);
  if (criticalFail) confidence = Math.min(confidence, 55);

  const level = decideLevel({
    rejected, rejectReason, needsVerification, criticalFail, pinVerified,
    technical, evidenceCoverage, confidence,
    unverifiedPart: !!candidate.unverified,
    mode: opts.mode,
  });

  return {
    rejected, rejectReason,
    needsVerification, verifyReasons,
    technical, evidenceCoverage, sourceConfidence: Math.round(sourceConfidence * 100),
    confidence, overallScore: confidence,
    paramScores, pinVerified, criticalFail,
    replacementLevel: level,
    dimensionScores: dimensionOf(paramScores, originalParams),
  };
}

/**
 * 约束判定
 * @param con {constraintType, min, max, options, mode}
 *   mode="cover"：候选的范围必须**覆盖**[min,max]（温度、电压等范围参数的默认语义）
 *   mode="within"：候选的值必须**落在**[min,max]内（价格上限、电流上限等）
 *   未指定时：候选值本身是范围 → cover；是单值 → within
 * @returns true 满足 / false 违反 / null 无法判定（值缺失）
 */
function checkConstraint(con, rawValue, unitHint) {
  const v = toQuantityIR(rawValue, unitHint);
  if (!v.known) return null;

  if (Array.isArray(con.options) && con.options.length) {
    const s = String(v.text ?? v.rawValue ?? "").toLowerCase();
    return con.options.some(o => s.includes(String(o).toLowerCase()));
  }

  const lo = con.min != null ? toQuantityIR(String(con.min), unitHint) : null;
  const hi = con.max != null ? toQuantityIR(String(con.max), unitHint) : null;
  const mode = con.mode || (v.isRange ? "cover" : "within");

  if (mode === "cover") {
    // 候选范围需覆盖要求范围：candMin <= reqMin 且 candMax >= reqMax
    if (lo?.known && (v.canonicalMin ?? v.canonicalTyp) > lo.canonicalTyp) return false;
    if (hi?.known && (v.canonicalMax ?? v.canonicalTyp) < hi.canonicalTyp) return false;
    return true;
  }
  // within：值需落在区间内
  if (lo?.known && (v.canonicalMin ?? v.canonicalTyp) < lo.canonicalTyp) return false;
  if (hi?.known && (v.canonicalMax ?? v.canonicalTyp) > hi.canonicalTyp) return false;
  return true;
}

function decideLevel(s) {
  if (s.rejected) return { ...LEVELS.REJECTED, desc: s.rejectReason || "不满足硬约束" };
  if (s.unverifiedPart) return { ...LEVELS.NEEDS_VERIFICATION, desc: "型号缺少权威来源证明其存在" };
  if (s.needsVerification) return { ...LEVELS.NEEDS_VERIFICATION, desc: "硬约束参数缺失，无法验证" };
  if (s.evidenceCoverage < 40) return { ...LEVELS.NEEDS_VERIFICATION, desc: "证据覆盖率过低" };
  if (s.criticalFail) {
    return s.confidence >= 55 ? { ...LEVELS.FUNCTIONAL_ALTERNATIVE, desc: "关键参数不同，需改固件/改板" }
                              : { ...LEVELS.REDESIGN_REQUIRED, desc: "差异较大，需重新设计" };
  }
  if (s.confidence >= 85 && s.evidenceCoverage >= 70) {
    // 无 Pin Map 证据时绝不给"直接替代"
    return s.pinVerified
      ? { ...LEVELS.DIRECT_REPLACEMENT, desc: "引脚映射已验证，可直接替换" }
      : { ...LEVELS.COMPATIBLE_WITH_REVIEW, desc: "参数高度匹配；引脚映射未验证，需人工核对后方可直接替换" };
  }
  if (s.confidence >= 70) return { ...LEVELS.COMPATIBLE_WITH_REVIEW, desc: "封装兼容，软件/配置需验证" };
  if (s.confidence >= 55) return { ...LEVELS.FUNCTIONAL_ALTERNATIVE, desc: "功能满足，需改板或改固件" };
  if (s.confidence >= 40) return { ...LEVELS.REDESIGN_REQUIRED, desc: "仅适合新设计" };
  return { ...LEVELS.NOT_RECOMMENDED, desc: "存在关键不兼容风险或证据不足" };
}

const DIM_KEYS = {
  hardware:  /封装|package|引脚|pin|gpio|温度|temperature|工作电压|supply\s*voltage|输入电压/i,
  functional:/内核|core|主频|frequency|flash|sram|通道|channel|分辨率|resolution|带宽|bandwidth|接口|interface|adc|定时器|timer|拓扑/i,
  electrical:/失调|offset|偏置|bias|噪声|noise|cmrr|psrr|压摆|slew|rds|vgs|qg|效率|efficiency|压差|dropout|轨到轨|rail|esd|inl|snr|静态电流|quiescent/i,
  supply:    /价格|price|库存|stock|交期|lead/i,
};
function dimensionOf(paramScores, params) {
  const dims = {};
  for (const [k, re] of Object.entries(DIM_KEYS)) {
    const hit = paramScores.filter(ps => {
      if (!ps.known) return false;
      const p = params?.find(x => x.id === ps.paramId);
      return p && re.test(`${p.name} ${p.nameEn || ""}`);
    });
    dims[k] = hit.length ? Math.round(hit.reduce((s, x) => s + x.score, 0) / hit.length) : null;
  }
  const known = paramScores.filter(p => p.known).length, total = paramScores.length || 1;
  const ai = paramScores.filter(p => p.known && /^ai/.test(p.source || "")).length;
  dims.risk = Math.max(0, Math.round((known / total) * 100 - (ai / total) * 25));
  return dims;
}

module.exports = {
  calculateScore, compareParam, checkConstraint, validateConstraint, decideLevel,
  SOURCE_CONFIDENCE, LEVELS, fmt,
  // 兼容旧调用
  scoreOneParam: (origParam, candValue) => compareParam(origParam, candValue, {}),
};
