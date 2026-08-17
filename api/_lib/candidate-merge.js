/**
 * candidate-merge.js — 候选去重与参数合并
 *
 * 为什么需要：
 * pipeline 只在 **AI 给出型号字符串之后、查询参数之前** 做过一次去重。
 * 但同一颗料在候选里往往以不同写法出现（LM358 / LM358DR / lm358-dr），
 * 查询后又各自解析到同一个订货号，于是推荐结果里出现两三张型号完全一样的卡片，
 * 而且每张只带着自己那一路数据源查到的半份参数。
 *
 * ⚠ 数据形状（v6.9.2 的教训）：
 * 进入合并的候选，其 parameters 是**按原型号参数 id 键控的对象**
 * `{ p1:{value,unit,source,...}, p2:{...} }`（由 alignLocalParams /
 * fetchComponentFromAPIs 产出），不是数组。首版按数组写并用数组 mock 测试，
 * 上线即崩 `.filter is not a function`。本版原生支持对象映射（键即对齐好的
 * 参数 id，无需再做名称匹配），并兼容数组形态兜底。
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
const isMap = p => p != null && typeof p === "object" && !Array.isArray(p);

/** 有值参数计数（两种形态通吃） */
function countValued(params) {
  if (Array.isArray(params)) return params.filter(hasValue).length;
  if (isMap(params)) return Object.values(params).filter(hasValue).length;
  return 0;
}

/** 合并键：归一化 MPN + canonical 厂商。不同厂商的同名 MPN 不合并 */
function mergeKey(cand) {
  const pn = normMpn(cand?.partNumber || cand?.mpn);
  const mfr = String(canonicalManufacturer(cand?.manufacturer || "") || "").toUpperCase();
  return `${pn}::${mfr}`;
}

/**
 * 对象映射形态合并：键即原型号参数 id，两侧键空间一致，按键并集取值。
 * 低优先级来源不覆盖高优先级来源的已有值；冲突记录不丢弃。
 */
function mergeParamMaps(primary, secondary, priRank, secRank, conflicts) {
  const out = {};
  const keys = new Set([...Object.keys(primary || {}), ...Object.keys(secondary || {})]);
  for (const k of keys) {
    const a = primary?.[k], b = secondary?.[k];
    const aHas = hasValue(a), bHas = hasValue(b);
    if (aHas && !bHas) { out[k] = a; continue; }
    if (!aHas && bHas) { out[k] = { ...b, _mergedFrom: b.source || "secondary" }; continue; }
    if (!aHas && !bHas) { out[k] = a || b || { value: "N/A" }; continue; }
    // 两边都有值
    if (String(a.value).trim() === String(b.value).trim()) { out[k] = a; continue; }
    const keepA = priRank >= secRank;
    out[k] = keepA ? a : { ...b, _mergedFrom: b.source || "secondary" };
    conflicts.push({
      paramId: k,
      kept: { value: (keepA ? a : b).value, unit: (keepA ? a : b).unit || "", source: (keepA ? a : b).source || "" },
      dropped: { value: (keepA ? b : a).value, unit: (keepA ? b : a).unit || "", source: (keepA ? b : a).source || "" },
    });
  }
  return out;
}

/** 数组形态合并（兜底路径，按参数名对齐） */
function mergeParamArrays(primary, secondary, priRank, secRank, conflicts) {
  const out = (primary || []).map(p => ({ ...p }));
  for (const ep of secondary || []) {
    if (!hasValue(ep)) continue;
    const idx = out.findIndex(bp => sameParam(bp.name || bp.nameEn, ep.name || ep.nameEn));
    if (idx < 0) { out.push({ ...ep, _mergedFrom: ep.source || "secondary" }); continue; }
    const bp = out[idx];
    if (!hasValue(bp)) { out[idx] = { ...ep, _mergedFrom: ep.source || "secondary" }; continue; }
    if (String(bp.value).trim() !== String(ep.value).trim()) {
      const keepPrimary = priRank >= secRank;
      if (!keepPrimary) out[idx] = { ...ep, _mergedFrom: ep.source || "secondary" };
      conflicts.push({
        name: bp.name || ep.name,
        kept: { value: keepPrimary ? bp.value : ep.value },
        dropped: { value: keepPrimary ? ep.value : bp.value },
      });
    }
  }
  return out;
}

/** extraParams（候选另有、原型号无对应项）按名称并集 */
function mergeExtraParams(a, b) {
  const out = [...(Array.isArray(a) ? a : [])];
  const seen = new Set(out.map(x => String(x?.name || "").toLowerCase()));
  for (const x of (Array.isArray(b) ? b : [])) {
    const k = String(x?.name || "").toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out.slice(0, 12);
}

/**
 * 去重并合并候选。
 * @param {Array} candidates fetchComponent 之后的候选对象数组
 * @returns {{merged:Array, duplicates:Array}} merged 保留首次出现顺序
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

      // 主记录取来源优先级更高者；同级取有值参数更多者
      const candWins = candRank > keptRank ||
        (candRank === keptRank && countValued(cand.parameters) > countValued(kept.parameters));
      const primary = candWins ? cand : kept;
      const secondary = candWins ? kept : cand;
      const priRank = sourceRank(primary._source), secRank = sourceRank(secondary._source);

      const conflicts = [];
      let parameters;
      const pp = primary.parameters, sp = secondary.parameters;
      if (isMap(pp) || isMap(sp)) {
        // 生产主路径：对象映射。一侧意外是数组时，数组侧无法按 id 对齐，弃其参数只保留映射侧
        parameters = mergeParamMaps(isMap(pp) ? pp : {}, isMap(sp) ? sp : {}, priRank, secRank, conflicts);
      } else {
        parameters = mergeParamArrays(pp, sp, priRank, secRank, conflicts);
      }

      const mergedSources = [...new Set([
        ...(kept._mergedSources || [kept._source]),
        ...(cand._mergedSources || [cand._source]),
      ].filter(Boolean))];

      byKey.set(key, {
        ...primary,
        parameters,
        extraParams: mergeExtraParams(primary.extraParams, secondary.extraParams),
        description: primary.description || secondary.description || "",
        manufacturer: primary.manufacturer || secondary.manufacturer || "",
        datasheetUrl: primary.datasheetUrl || secondary.datasheetUrl || "",
        // exactMatch 任一侧为 false 则合并结果不得声称 exact（isAuthoritative 依赖它）
        ...(kept.exactMatch === false || cand.exactMatch === false ? { exactMatch: false } : {}),
        _mergedSources: mergedSources,
        _mergedCount: (kept._mergedCount || 1) + 1,
        _paramConflicts: [...(kept._paramConflicts || []), ...(cand._paramConflicts || []), ...conflicts],
      });
      duplicates.push({ partNumber: cand.partNumber, mergedInto: primary.partNumber, sources: mergedSources });
      continue;
    }
    byKey.set(key, cand);
    order.push(key);
  }

  return { merged: order.map(k => byKey.get(k)), duplicates };
}

module.exports = { mergeCandidates, mergeKey, sourceRank, hasValue, normMpn, countValued };
