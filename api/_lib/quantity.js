// quantity.js — 统一量纲中间表示（QuantityIR）
//
// 为什么需要：此前评分把「候选裸值」套上「原型号单位」再比较，
// 导致 72 MHz 与 72,000,000 Hz 被判为"差距显著"。
// 原型号与候选必须各自独立解析出 value+unit，再在规范单位下比较。
//
// 同时承载测试条件（Rds(on)@Vgs=10V），条件不同的数值不得直接比较。

const SI = {
  T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3, "": 1,
  m: 1e-3, u: 1e-6, µ: 1e-6, μ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15,
};

// 量纲定义：base 为规范单位，match 判定单位串属于该量纲
const DIMS = [
  { dim: "voltage",     base: "V",     re: /^([TGMkKmuµμnpf]?)V$/ },
  { dim: "current",     base: "A",     re: /^([TGMkKmuµμnpf]?)A$/ },
  { dim: "resistance",  base: "Ω",     re: /^([TGMkKmuµμnpf]?)(?:Ω|ohms?|R)$/i },
  { dim: "capacitance", base: "F",     re: /^([TGMkKmuµμnpf]?)F$/ },
  { dim: "inductance",  base: "H",     re: /^([TGMkKmuµμnpf]?)H$/ },
  { dim: "frequency",   base: "Hz",    re: /^([TGMkKmuµμnpf]?)Hz$/i },
  { dim: "power",       base: "W",     re: /^([TGMkKmuµμnpf]?)W$/ },
  { dim: "charge",      base: "C",     re: /^([TGMkKmuµμnpf]?)C$/ },
  { dim: "time",        base: "s",     re: /^([TGMkKmuµμnpf]?)s(?:ec)?$/i },
  { dim: "temperature", base: "°C",    re: /^°?C$/i },
  { dim: "ratio_db",    base: "dB",    re: /^dB[a-zA-Z]*$/ },
  { dim: "percent",     base: "%",     re: /^%$/ },
  { dim: "bits",        base: "bit",   re: /^bits?$/i },
  { dim: "slewrate",    base: "V/s",   re: /^([TGMkKmuµμnpf]?)V\/([TGMkKmuµμnpf]?)s$/ },
  { dim: "rate",        base: "SPS",   re: /^([TGMkK]?)(?:SPS|S\/s)$/i },
  { dim: "noise_density", base: "V/√Hz", re: /^([TGMkKmuµμnpf]?)V\/(?:√|sqrt)Hz$/i },
];

// 存储容量：SI 与 binary 必须区分（KB=1000B，KiB=1024B）
const MEM = [
  { re: /^KiB$/i, mul: 1024 }, { re: /^MiB$/i, mul: 1024 ** 2 }, { re: /^GiB$/i, mul: 1024 ** 3 },
  { re: /^KB$/, mul: 1000 },   { re: /^MB$/, mul: 1000 ** 2 },   { re: /^GB$/, mul: 1000 ** 3 },
  { re: /^B$/, mul: 1 },
];

/** 单位串 → { dim, base, mul }，未识别返回 null */
function parseUnit(u) {
  const s = String(u || "").trim();
  if (!s) return null;
  for (const m of MEM) if (m.re.test(s)) return { dim: "memory", base: "B", mul: m.mul };
  for (const d of DIMS) {
    const hit = s.match(d.re);
    if (!hit) continue;
    if (d.dim === "slewrate") {
      const num = SI[hit[1] || ""] ?? 1, den = SI[hit[2] || ""] ?? 1;
      return { dim: d.dim, base: d.base, mul: num / den };
    }
    const mul = SI[hit[1] || ""] ?? 1;
    return { dim: d.dim, base: d.base, mul };
  }
  return null;
}

/** 从文本中剥离测试条件，如 "12 mΩ @ Vgs=10V" → { body:"12 mΩ", condition:{Vgs:"10V"} } */
function splitCondition(text) {
  const s = String(text || "");
  const at = s.split(/\s*@\s*|\s*\bat\b\s*(?=[A-Za-z])/);
  if (at.length < 2) return { body: s.trim(), condition: null };
  const body = at[0].trim();
  const condition = {};
  for (const part of at.slice(1).join(" ").split(/[,;、]/)) {
    const kv = part.match(/([A-Za-z][\w()+\-/]*)\s*=\s*([^\s,;]+)/);
    if (kv) condition[kv[1]] = kv[2];
    else if (part.trim()) condition[`_${Object.keys(condition).length}`] = part.trim();
  }
  return { body, condition: Object.keys(condition).length ? condition : null };
}

const NA_RE = /^(n\/?a|na|—|-|--|tbd|unknown|未知|无)$/i;

/**
 * 解析为 QuantityIR
 * @param rawValue 原始值（可能自带单位与条件）
 * @param fallbackUnit 该参数的默认单位（仅在值本身不含单位时使用）
 */
function toQuantityIR(rawValue, fallbackUnit = "", meta = {}) {
  const base = {
    rawValue, known: false, confidence: meta.confidence ?? 0,
    sourceType: meta.sourceType || "", sourceUrl: meta.sourceUrl, evidenceId: meta.evidenceId,
  };
  if (rawValue === undefined || rawValue === null) return base;
  const rawStr = String(rawValue).trim();
  if (!rawStr || NA_RE.test(rawStr)) return base;

  const { body, condition } = splitCondition(rawStr);
  const out = { ...base, known: true, condition: condition || undefined, text: body };

  // 单位：优先取值内部的，其次用参数默认单位
  const unitInValue = body.match(/(-?[\d.]+(?:[eE][-+]?\d+)?)\s*([A-Za-zΩ°µμ%√/]+[A-Za-zΩ°µμ%√/\d]*)/);
  let unitStr = unitInValue ? unitInValue[2] : "";
  let uinfo = parseUnit(unitStr);
  if (!uinfo && fallbackUnit) { unitStr = String(fallbackUnit).trim(); uinfo = parseUnit(unitStr); }
  out.unit = unitStr || undefined;
  out.canonicalUnit = uinfo?.base;
  out.dim = uinfo?.dim;

  const conv = v => (uinfo ? v * uinfo.mul : v);

  // ± 形式
  const pm = body.match(/^[±]\s*([\d.]+(?:[eE][-+]?\d+)?)/);
  if (pm) {
    const v = parseFloat(pm[1]);
    out.min = -v; out.max = v; out.typ = v; out.isRange = true;
    out.canonicalMin = conv(-v); out.canonicalMax = conv(v); out.canonicalTyp = conv(v);
    return out;
  }
  // 范围：a to b / a~b / a…b（负号不作分隔符）
  const rg = body.match(/(-?[\d.]+(?:[eE][-+]?\d+)?)\s*(?:to|~|至|\.\.\.|–|—|-)\s*(\+?-?[\d.]+(?:[eE][-+]?\d+)?)/i);
  if (rg) {
    const a = parseFloat(rg[1]), b = parseFloat(rg[2]);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    out.min = lo; out.max = hi; out.typ = (lo + hi) / 2; out.isRange = true;
    out.canonicalMin = conv(lo); out.canonicalMax = conv(hi); out.canonicalTyp = conv((lo + hi) / 2);
    return out;
  }
  // 单值
  const one = body.match(/(-?[\d.]+(?:[eE][-+]?\d+)?)/);
  if (one) {
    const v = parseFloat(one[1]);
    if (Number.isFinite(v)) {
      out.value = v; out.typ = v; out.min = v; out.max = v; out.isRange = false;
      out.canonicalValue = conv(v); out.canonicalTyp = conv(v);
      out.canonicalMin = conv(v); out.canonicalMax = conv(v);
      return out;
    }
  }
  // 纯文本（枚举/布尔/型号等）
  out.isText = true;
  return out;
}

/** 两个 QuantityIR 是否可数值比较（都已知、都有规范值、量纲一致） */
function comparable(a, b) {
  if (!a?.known || !b?.known) return false;
  if (a.isText || b.isText) return false;
  if (a.canonicalTyp === undefined || b.canonicalTyp === undefined) return false;
  // 有量纲则必须一致；两侧都无量纲（纯数）视为可比
  if (a.dim && b.dim) return a.dim === b.dim;
  if (a.dim || b.dim) return false;
  return true;
}

/** 测试条件是否一致（键交集上逐一比对；无交集视为未知→不判定不一致） */
function conditionMatch(a, b) {
  const ca = a?.condition, cb = b?.condition;
  if (!ca && !cb) return { same: true, checked: false };
  if (!ca || !cb) return { same: false, checked: true, reason: "一方标注了测试条件，另一方未标注" };
  const keys = Object.keys(ca).filter(k => k in cb && !k.startsWith("_"));
  if (!keys.length) return { same: true, checked: false };
  const diff = [];
  for (const k of keys) {
    const va = toQuantityIR(ca[k]), vb = toQuantityIR(cb[k]);
    const eq = comparable(va, vb)
      ? Math.abs(va.canonicalTyp - vb.canonicalTyp) <= Math.abs(va.canonicalTyp || 1) * 0.02
      : String(ca[k]).toLowerCase() === String(cb[k]).toLowerCase();
    if (!eq) diff.push(`${k}: ${ca[k]} vs ${cb[k]}`);
  }
  return diff.length ? { same: false, checked: true, reason: `测试条件不同（${diff.join("；")}）` } : { same: true, checked: true };
}

module.exports = { toQuantityIR, parseUnit, splitCondition, comparable, conditionMatch, SI };
