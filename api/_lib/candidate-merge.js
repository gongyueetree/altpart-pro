/**
 * candidate-merge.js — 候选去重与参数合并
 *
 * 为什么需要：
 * pipeline 只在 **AI 给出型号字符串之后、查询参数之前** 做过一次去重。
 * 但同一颗料在候选里往往以不同写法出现（LM358 / LM358DR / lm358-dr），
 * 查询后又各自解析到同一个订货号，于是推荐结果里出现两三张型号完全一样的卡片，
 * 而且每张只带着自己那一路数据源查到的半份参数，比较结果还互相打架。
 *
 * 做法：查询完成后按「归一化 MPN + canonical 厂商」再去重一次，
 * 并按 ezPLM > DigiKey/Mouser > 互联网/AI 的优先级逐参数合并，
 * 让合并后的那一条拿到尽可能完整的参数再进评分。
 */

const { canonicalManufacturer } = require("./part-identity");
const { sameParam } = require("./param-align");

/** 数据源可信优先级，数字越大越优先 */
const SOURCE_RANK = {
  ezplm: 4,
  "digikey+mouser": 3,
  digikey: 3,
  mouser: 3,
  ai_search: 1,
};
function sourceRank(src) {
  const s = String(src || "").toLowerCase();
  if (SOURCE_RANK[s] != null) return SOURCE_RANK[s];
  if (s.startsWith("digikey") || s.startsWith("mouser")) return 3;
  if (s.startsWith("ezplm")) return 4;
  return 0;
}

/** 参数值是否算"有值" —— N/A、未知、空串都不算 */
function hasValue(p) {
  const v = String(p?.value ?? "").trim();
  return !!v && !/^(n\/?a|未知|不详|-{1,2}|null|undefined)$/i.test(v);
}

const normMpn = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 合并键：归一化 MPN + canonical 厂商。不同厂商的同名 MPN 不合并 */
function mergeKey(cand) {
  const pn = normMpn(cand?.partNumber || cand?.mpn);
  const mfr = String(canonicalManufacturer(cand?.manufacturer || "") || "").toUpperCase();
  return `${pn}::${mfr}`;
}

/**
 * 逐参数合并：按来源优先级取值；同级时取"有值"的那个；
 * 都有值且不同时保留高优先级来源的值，并记录冲突以便前端提示。
 */
function mergeParameters(baseCand, extraCand) {
  const out = (baseCand.parameters || []).map(p => ({ ...p }));
  const baseRank = sourceRank(baseCand._source);
  const extraRank = sourceRank(extraCand._source);
  const conflicts = [];

  for (const ep of extraCand.parameters || []) {
    if (!hasValue(ep)) continue;
    const idx = out.findIndex(bp => sameParam(bp.name || bp.nameEn, ep.name || ep.nameEn));
    if (idx < 0) {
      // 本条没有的参数，直接补进来（标明来源，评分层据此定可信度）
      out.push({ ...ep, source: ep.source || extraCand._source, _mergedFrom: extraCand._source });
      continue;
    }
    const bp = out[idx];
    if (!hasValue(bp)) {
      out[idx] = { ...ep, source: ep.source || extraCand._source, _mergedFrom: extraCand._source };
      continue;
    }
    // 两边都有值：低优先级来源不覆盖高优先级来源，只记冲突
    if (String(bp.value).trim() !== String(ep.value).trim()) {
      conflicts.push({
        name: bp.name || ep.name,
        kept: { value: bp.value, unit: bp.unit || "", source: bp.source || baseCand._source },
        dropped: { value: ep.value, unit: ep.unit || "", source: ep.source || extraCand._source },
      });
      if (extraRank > baseRank) out[idx] = { ...ep, source: ep.source || extraCand._source, _mergedFrom: extraCand._source };
    }
  }
  return { parameters: out, conflicts };
}

/**
 * 去重并合并候选。
 * @param {Array} candidates fetchComponent 之后的候选对象数组
 * @returns {{merged:Array, duplicates:Array}} merged 已按原顺序保留首次出现位置
 */
function mergeCandidates(candidates) {
  const byKey = new Map();
  const order = [];
  const duplicates = [];

  for (const cand of candidates || []) {
    if (!cand || !cand.partNumber) continue;
    const key = mergeKey(cand);
    if (!key.startsWith("::") && byKey.has(key)) {
      const kept = byKey.get(key);
      const keptRank = sourceRank(kept._source);
      const candRank = sourceRank(cand._source);

      // 主记录取来源优先级更高者；同级取参数更全者
      const keptParams = (kept.parameters || []).filter(hasValue).length;
      const candParams = (cand.parameters || []).filter(hasValue).length;
      const candWins = candRank > keptRank || (candRank === keptRank && candParams > keptParams);
      const primary = candWins ? cand : kept;
      const secondary = candWins ? kept : cand;

      const { parameters, conflicts } = mergeParameters(primary, secondary);
      const mergedSources = [...new Set([
        ...(kept._mergedSources || [kept._source]),
        ...(cand._mergedSources || [cand._source]),
      ].filter(Boolean))];

      const merged = {
        ...primary,
        parameters,
        // 主记录字段缺失时用次记录补（描述/厂商/资料链接常只有一边有）
        description: primary.description || secondary.description || "",
        manufacturer: primary.manufacturer || secondary.manufacturer || "",
        datasheetUrl: primary.datasheetUrl || secondary.datasheetUrl || "",
        _mergedSources: mergedSources,
        _mergedCount: (kept._mergedCount || 1) + 1,
        _paramConflicts: [...(kept._paramConflicts || []), ...(cand._paramConflicts || []), ...conflicts],
      };
      byKey.set(key, merged);
      duplicates.push({ partNumber: cand.partNumber, mergedInto: primary.partNumber, sources: mergedSources });
      continue;
    }
    byKey.set(key, cand);
    order.push(key);
  }

  return { merged: order.map(k => byKey.get(k)), duplicates };
}

module.exports = { mergeCandidates, mergeKey, sourceRank, hasValue, normMpn };
