// pin-compare.js — 只用结构化、可追溯的 PinMap 生成直接替代证据。

const { normPin } = require("./pin-normalize");

const AUTHORITATIVE = /^(ezplm|datasheet|manufacturer|kicad|manual|manufacturer_api)$/i;
const normName = value => String(value || "").toUpperCase()
  .replace(/\b(GPIO|PIN)\b/g, "").replace(/[^A-Z0-9#+-]/g, "");
// 只合并语义确定的无连接别名。VSS/GND、VCC/VDD 在某些器件上代表不同电压域，
// 没有标准化 role 证据时不能仅凭名称猜测为同一功能。
const aliases = [new Set(["NC", "DNC", "NOCONNECT"])];
const TYPE_RULES = [
  [/^(?:input|in|输入)$/i, "input"],
  [/^(?:output|out|输出)$/i, "output"],
  [/^(?:bidirectional|bidir|inout|双向)$/i, "bidirectional"],
  [/^(?:power[_ -]?in|power[_ -]?input|电源输入)$/i, "power_in"],
  [/^(?:power[_ -]?out|power[_ -]?output|电源输出)$/i, "power_out"],
  [/^(?:passive|无源)$/i, "passive"],
  [/^(?:open[_ -]?(?:collector|drain)|oc|od)$/i, "open_drain"],
];

function sameFunction(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return aliases.some(set => set.has(x) && set.has(y));
}

function normalizedType(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  for (const [rule, type] of TYPE_RULES) if (rule.test(raw)) return type;
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pinSource(part) {
  return String(part?.pinEvidence?.source || part?.pinsSource || part?._source || "");
}

function normalizedPins(part) {
  const source = pinSource(part);
  const list = Array.isArray(part?.pins) ? part.pins : Array.isArray(part?.pinMap) ? part.pinMap : [];
  const pins = [];
  const seen = new Set();
  const duplicates = [];
  for (const raw of list) {
    const number = normPin(raw?.number ?? raw?.pin ?? raw?.pad);
    const name = String(raw?.name ?? raw?.function ?? raw?.signal ?? "").trim();
    if (!number || !name) continue;
    if (seen.has(number)) duplicates.push(number);
    else { seen.add(number); pins.push({ number, name, role: raw?.role || raw?.standardFunction || "",
      type: raw?.type || raw?.electricalType || "" }); }
  }
  return { pins, source, duplicates };
}

function comparePinMaps(original, candidate) {
  const a = normalizedPins(original), b = normalizedPins(candidate);
  if (!a.pins.length || !b.pins.length) return {
    status: "insufficient", verified: false,
    reason: "原型号或候选缺少结构化 PinMap",
    evidence: { originalSource: a.source || null, candidateSource: b.source || null },
  };
  if (!AUTHORITATIVE.test(a.source) || !AUTHORITATIVE.test(b.source)) return {
    status: "insufficient", verified: false,
    reason: "PinMap 来源不是 datasheet/ezPLM/KiCad/人工验证记录",
    evidence: { originalSource: a.source || null, candidateSource: b.source || null },
  };
  if (a.duplicates.length || b.duplicates.length) return {
    status: "conflict", verified: false,
    reason: "PinMap 存在重复引脚编号",
    conflicts: [...a.duplicates, ...b.duplicates].slice(0, 20),
  };

  const am = new Map(a.pins.map(p => [p.number, p]));
  const bm = new Map(b.pins.map(p => [p.number, p]));
  const all = [...new Set([...am.keys(), ...bm.keys()])];
  const conflicts = [];
  const missingElectricalType = [];
  for (const number of all) {
    const op = am.get(number), cp = bm.get(number);
    if (!op || !cp) conflicts.push({ number, original: op?.name || null, candidate: cp?.name || null, reason: "引脚编号缺失" });
    else if (!sameFunction(op.role && cp.role ? op.role : op.name, op.role && cp.role ? cp.role : cp.name))
      conflicts.push({ number, original: op.name, candidate: cp.name, reason: "引脚功能不同" });
    else {
      const ot = normalizedType(op.type), ct = normalizedType(cp.type);
      if (!ot || !ct) missingElectricalType.push(number);
      else if (ot !== ct) conflicts.push({ number, original: op.type, candidate: cp.type, reason: "电气类型/方向不同" });
    }
  }
  if (conflicts.length) return {
    status: "conflict", verified: false,
    reason: `发现 ${conflicts.length} 个逐针冲突`, conflicts: conflicts.slice(0, 30),
      coverage: Math.round(((all.length - conflicts.length) / Math.max(1, all.length)) * 100),
  };
  if (missingElectricalType.length) return {
    status: "insufficient", verified: false,
    reason: `有 ${missingElectricalType.length} 个引脚缺少电气类型/方向证据`,
    missingElectricalType: missingElectricalType.slice(0, 30),
    coverage: 100,
    evidence: { originalSource: a.source, candidateSource: b.source },
  };
  return {
    status: "verified", verified: true, reason: "逐针编号与功能一致",
    coverage: 100, pinCount: all.length,
    evidence: { originalSource: a.source, candidateSource: b.source,
      originalRef: original?.pinEvidence?.url || null, candidateRef: candidate?.pinEvidence?.url || null },
  };
}

module.exports = { comparePinMaps, normalizedPins, sameFunction, normalizedType };
