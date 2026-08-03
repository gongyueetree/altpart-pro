// pipeline.js — v2.1 推荐流程编排
// 流程: 本地库优先 → AI推荐10个 → 本地库校验 → 算法评分 → 淘汰差异大的 → 输出Top5

const { queryLocalDB, queryLocalDBBatch, searchParts } = require("./ezplm");
const { applyScenarioPriority, getApplicationHint, scenarioHardParams } = require("./applications");
const { applyProfile, PROFILES } = require("./rule-profiles");
const { resolveIdentity, splitMpn, pickVariants } = require("./part-identity");
const { alignParams } = require("./param-align");
const { organizeParams } = require("./category-params");
const { getDistributorPart } = require("./distributor");
const { analyzeComponent, getCandidates, lookupPartSpecs } = require("./gemini");
const { fetchComponentFromAPIs } = require("./component");
const { cache } = require("./cache");

// 淘汰阈值: 综合分低于此值的候选直接淘汰
const ELIMINATION_THRESHOLD = 40;

/**
 * 候选是否有权威来源证明其存在。
 * AI 生成的型号名不算证据 —— 线上曾出现 AI 编造型号进入 Top3。
 * 权威 = ezPLM 收录 或 分销商 exact MPN 命中。
 */
function isAuthoritative(cand) {
  if (!cand) return false;
  if (cand._source === "ezplm") return true;
  if (/^(digikey|mouser)/.test(cand._source || "")) return cand.exactMatch !== false;
  return false;
}

/**
 * 虚构型号识别：AI 自述"不存在/虚构"，或参数几乎全为 N/A。
 * 这是最后一道防线；主防线是"必须有权威来源证明存在"。
 */
function looksFictitious(partNumber, aiData) {
  const text = `${aiData?.description || ""} ${aiData?.manufacturer || ""} ${aiData?.category || ""}`.toLowerCase();
  if (/fictitious|does\s*not\s*exist|not\s*a\s*real|no\s*real\s*data|虚构|不存在|查无此/.test(text)) return true;
  const ps = aiData?.parameters || [];
  if (!ps.length) return true;
  const naCount = ps.filter(p => p.value == null || /^n\/?a$/i.test(String(p.value).trim())).length;
  if (naCount / ps.length >= 0.8) return true;                       // 八成以上无值
  if (/^[A-Z_]*NOT_?A_?REAL|TEST_?PART|FAKE|DUMMY|XXXX/i.test(partNumber)) return true;
  return false;
}

/**
 * MPN 前缀 → 功能类别（受控映射，优先级高于描述关键词）
 * ALT-004：STM32F303 内置比较器与运放，描述里出现 "comparator/op-amp"，
 * 纯关键词匹配把整颗 MCU 判成了比较器，导致合法候选被误淘汰。
 * 器件本体类别应由型号前缀这类确定性特征决定，外设名称不得改变主类别。
 */
const MPN_CATEGORY = [
  [/^STM32|^GD32|^CH32|^HK32|^APM32|^AT32|^MM32|^N32|^ES32/i, "mcu"],
  [/^(ATMEGA|ATTINY|ATSAM|PIC\d|DSPIC|MSP430|NRF5|ESP32|ESP8266|RP2\d|LPC\d|MK\d\d|EFM32|CY8C)/i, "mcu"],
  [/^(LM|TL|OPA|AD8|ADA|MCP6|NE55|TLV|LMV|MAX4|LT1|LTC6)/i, null],   // 需进一步看描述
  [/^(TPS|LM2[567]|MP\d{4}|SY8|XL\d{4}|AP\d{4}|RT\d{4})/i, null],
];
function categoryByMpn(mpn) {
  const s = String(mpn || "").toUpperCase().trim();
  if (!s) return null;
  for (const [re, cat] of MPN_CATEGORY) if (re.test(s) && cat) return cat;
  return null;
}

/** 主类别关键词（描述中出现即判定为该类器件本体） */
const PRIMARY_MARKERS = [
  ["mcu", /microcontroller|单片机|\bmcu\b|微控制器|cortex-?m|risc-?v\s*(mcu|核)/i],
  ["adc", /\badc\b|模数转换器|analog.to.digital\s*converter/i],
  ["dac", /\bdac\b|数模转换器|digital.to.analog\s*converter/i],
];

/** 功能类别归一化：中英文/别名 → 统一代码 */
function normFunc(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return "";
  const M = [
    ["vga", /variable[- ]?gain|可变增益|vga/],
    ["opamp", /operational[- ]?amplifier|运算放大器|运放|op[- ]?amp/],
    ["inamp", /instrumentation[- ]?amplifier|仪表放大器|仪用放大/],
    ["demod", /demodulator|modulator|解调|调制|mixer|混频/],
    ["rfamp", /rf[- ]?amplifier|lna|low[- ]?noise[- ]?amp|射频放大/],
    ["comparator", /comparator|比较器/],
    ["vref", /voltage[- ]?reference|基准电压|电压基准|shunt[- ]?regulator|并联稳压/],
    ["ldo", /\bldo\b|linear[- ]?regulator|线性稳压/],
    ["dcdc", /dc[- ]?dc|buck|boost|switching[- ]?regulator|降压|升压|开关稳压|开关电源/],
    ["mcu", /microcontroller|\bmcu\b|单片机|微控制器/],
    ["adc", /analog[- ]?to[- ]?digital|\badc\b|模数转换/],
    ["dac", /digital[- ]?to[- ]?analog|\bdac\b|数模转换/],
    ["mosfet", /mosfet|场效应|\bfet\b/],
    ["logic", /logic[- ]?gate|逻辑门|shift[- ]?register|移位寄存/],
    ["interface", /transceiver|interface|收发器|接口芯片/],
    ["sensor", /sensor|传感器/],
    ["memory", /eeprom|flash memory|\bsram\b|存储器/],
  ];
  for (const [code, re] of M) if (re.test(t)) return code;
  return "";
}

/** 类别是否可互为替代（同类，或明确的近亲类别） */
function funcCompatible(a, b) {
  if (a === b) return true;
  const KIN = [["opamp", "inamp"], ["ldo", "vref"]];   // 有限的近亲，需人工确认
  return KIN.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}
// 参数少于此数时用 AI 补齐（否则评分缺乏依据）
const MIN_PARAMS = 5;

/** 提取基础型号：去掉封装/包装后缀，用于搜同系列变体
 *  TPS62160DGKR → TPS62160 ; TL431-1 → TL431 ; AD603ARZ-REEL7 → AD603 */
function baseMpn(mpn) {
  let s = String(mpn).toUpperCase().trim();
  s = s.replace(/[-_](REEL\d*|TR|T\d?|R\d?|\d)$/i, "");         // 包装/序号后缀
  // 主型号：字母前缀 + 数字，允许中间再跟字母数字段（保留 STM32F103 这类特征）
  const m = s.match(/^([A-Z]{1,4}\d{2,6}(?:[A-Z]\d{2,4})?)/);
  if (!m) return s;
  let base = m[1];
  // 去掉尾部单个封装/等级字母（AD9833B → AD9833），但保留 F103 这种字母+数字组合
  base = base.replace(/(?<=\d)[A-Z]$/, "");
  return base;
}
// AI 推荐数量（多推荐，后筛选）
const AI_CANDIDATE_COUNT = 10;
// 最终输出数量
const FINAL_RESULT_COUNT = 5;

/**
 * Step 1: 获取原始器件参数
 * 优先级: ezPLM本地库 → 缓存 → AI联网搜索
 */
async function resolveOriginalPart(partNumber, onProgress) {
  // 1a. 查本地数据库
  onProgress?.("正在查询本地数据库...");
  const localData = await queryLocalDB(partNumber);
  if (localData?.parameters?.length) {
    console.log(`[Pipeline] ${partNumber}: found in ezPLM (${localData.parameters.length} params)`);

    // ── 参数不足时用 AI 补齐（混合模式）──
    // ezPLM 部分物料 attributes 为空，只有封装信息，不足以支撑替代评分
    let parameters = [...localData.parameters];
    const originalCount = parameters.length;
    let enriched = false;
    if (parameters.length < MIN_PARAMS) {
      // 先用分销商权威数据补，仍不足再用 AI
      try {
        onProgress?.("ezPLM 参数较少，正在查询分销商数据...");
        const dist = await getDistributorPart(localData.partNumber);
        if (dist?.parameters?.length) {
          const norm = t => String(t).toLowerCase().replace(/[\s\[\]()（）]/g, "");
          const has = n => parameters.some(p => norm(p.name).includes(norm(n)) || norm(n).includes(norm(p.name)));
          let idx = parameters.length;
          for (const dp of dist.parameters) if (!has(dp.name)) parameters.push({ ...dp, id: `param_${++idx}` });
          enriched = parameters.length > originalCount;
        }
      } catch (e) { console.warn("[Pipeline] 分销商补充失败:", e.message); }
    }
    if (parameters.length < MIN_PARAMS) {
      onProgress?.("正在联网补充关键参数...");
      console.log(`[Pipeline] ${partNumber}: 参数仅${parameters.length}个，AI补充中`);
      try {
        const ai = await analyzeComponent(localData.partNumber);
        if (ai?.parameters?.length) {
          const norm = t => String(t).toLowerCase().replace(/[\s\[\]()（）]/g, "");
          const has = n => parameters.some(p => norm(p.name).includes(norm(n)) || norm(n).includes(norm(p.name)));
          let idx = parameters.length;
          for (const ap of ai.parameters) {
            if (!ap?.name || has(ap.name)) continue;
            const v = ap.value;
            if (v === undefined || v === null || /^n\/?a$/i.test(String(v).trim())) continue;
            parameters.push({ ...ap, id: `param_${++idx}`, source: "ai_search", sourceLabel: "AI搜索", confidence: "low", verified: false });
          }
          enriched = parameters.length > originalCount;
        }
      } catch (e) { console.warn("[Pipeline] AI补充参数失败:", e.message); }
    }

    // ── 同系列变体（用基础型号搜，覆盖更全）──
    let variants = [];
    try {
      const base = baseMpn(localData.partNumber);
      const sibs = await searchParts(base, 30);
      const pick = pickVariants(partNumber, sibs, 10);
      const norm = x => String(x).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const self = norm(localData.partNumber);
      const seen = new Set([self]);
      variants = pick.variants
        .filter(p => { const n = norm(p.partNumber); if (seen.has(n)) return false; seen.add(n); return true; })
        .map(p => ({ pn: p.partNumber, package: p.footprint || "", note: p.description || "",
          ezplmId: p.ezplmId, manufacturer: p.manufacturer || "" }));
    } catch (e) { console.warn("[Pipeline] 变体查询失败:", e.message); }

    // 按品类挑选代表性参数并语义去重（合并 ezPLM + 分销商 + AI 后必有中英重复）
    const org = organizeParams(parameters, `${localData.category || ""} ${localData.description || ""}`, 10);
    return {
      ...localData, parameters: org.params,
      paramCategory: org.category, paramTemplate: org.template,
      missingTemplateParams: org.missingTemplateParams,
      droppedParams: org.dropped.map(p => ({ name: p.name, value: p.value })),
      // ezPLM 直接给出的同族变体优先；否则用 searchParts 的结果
      variants: (localData.variants?.length ? localData.variants : variants),
      needsVariantConfirm: !!localData.needsVariantConfirm,
      requestedMpn: localData.requestedMpn || partNumber,
      _matchType: localData._matchType || "exact",
      _dataPath: enriched ? "local_db+ai" : "local_db",
    };
  }

  // 1b. 查缓存
  const ck = `analyze:${partNumber.toLowerCase()}`;
  const cached = cache.get(ck);
  if (cached) {
    console.log(`[Pipeline] ${partNumber}: found in cache`);
    return { ...cached, _dataPath: "cache" };
  }

  // 1c. 分销商 API（DigiKey / Mouser）—— 厂商申报数据，权威度高于 AI
  onProgress?.("ezPLM 未收录，正在查询分销商数据库...");
  try {
    const dist = await getDistributorPart(partNumber);
    if (dist?.parameters?.length) {
      console.log(`[Pipeline] ${partNumber}: 分销商命中 ${dist._source} (${dist.parameters.length} params)`);
      let out = { ...dist, _dataPath: dist._source };
      // 分销商参数仍偏少时用 AI 补充（如噪声、带宽等分销商不常列的指标）
      if (out.parameters.length < MIN_PARAMS) {
        try {
          const ai = await analyzeComponent(partNumber);
          const norm = t => String(t).toLowerCase().replace(/[\s\[\]()（）]/g, "");
          const has = n => out.parameters.some(p => norm(p.name).includes(norm(n)) || norm(n).includes(norm(p.name)));
          let idx = out.parameters.length;
          for (const ap of (ai?.parameters || [])) {
            if (!ap?.name || has(ap.name)) continue;
            const v = ap.value;
            if (v == null || /^n\/?a$/i.test(String(v).trim())) continue;
            out.parameters.push({ ...ap, id: `param_${++idx}`, source: "ai_search", sourceLabel: "AI搜索", confidence: "low", verified: false });
          }
          if (out.parameters.length > dist.parameters.length) out._dataPath = dist._source + "+ai";
        } catch (e) {}
      }
      const orgD = organizeParams(out.parameters, `${out.category || ""} ${out.description || ""}`, 10);
      out.parameters = orgD.params;
      out.paramCategory = orgD.category; out.paramTemplate = orgD.template;
      out.missingTemplateParams = orgD.missingTemplateParams;
      out.droppedParams = orgD.dropped.map(p => ({ name: p.name, value: p.value }));
      cache.set(ck, out, 7 * 86400);
      return out;
    }
  } catch (e) { console.warn("[Pipeline] 分销商查询失败:", e.message); }

  // 1d. AI 联网搜索（最后兜底）
  onProgress?.("正在联网搜索 Datasheet...");
  console.log(`[Pipeline] ${partNumber}: not in local DB, falling back to AI search`);
  const aiData = await analyzeComponent(partNumber);
  // ⚠ AI 不能证明型号存在。线上曾出现 NOT_A_REAL_PART_12345 被 AI 描述为
  // "Fictitious Part" 后仍进入工作台并允许推荐。AI 结果一律标记 unverified，
  // 由调用方（analyze 端点）决定是否放行。
  if (aiData?.parameters?.length) {
    // 标注数据来源为 AI
    aiData.parameters = aiData.parameters.map(p => ({
      ...p, source: "ai_search", sourceLabel: "AI搜索", confidence: "low",
    }));
    const fictitious = looksFictitious(partNumber, aiData);
    const out = { ...aiData, _dataPath: "ai_search", unverified: true,
      identity: { requestedMpn: partNumber, exactMpn: null,
        baseDevice: splitMpn(partNumber).baseDevice, matchType: "unverified" },
      fictitious };
    if (!fictitious) cache.set(ck, out, 7 * 86400);   // 疑似虚构不写缓存，避免占用配额
    return out;
  }
  throw new Error("无法获取器件参数（本地库未收录且联网搜索失败）");
}

/**
 * Step 2-4: 完整推荐流程
 */
async function runPipeline({ partNumber, mode, scenario, application = "generic", preferredManufacturers = [], constraints = {}, priorityOrder, originalData, procurement, onProgress }) {
  const startTime = Date.now();
  const stats = { localDbHits: 0, apiHits: 0, aiLookups: 0 };

  // ─── Step 1: 解析原始器件（本地优先）───
  const original = (originalData?.parameters?.length)
    ? originalData                                     // 两段式流程：前端已通过 /analyze 拿到参数，直接复用
    : await resolveOriginalPart(partNumber, onProgress);
  const params = original.parameters;
  const isNAv = v => v === undefined || v === null || /^n\/?a$/i.test(String(v).trim());
  const usable = params.filter(p => !isNAv(p.value));

  // ── 场景硬约束真正生效 ──
  // 此前 application 只影响提示词与排序，"电池场景要求低 Iq" 之类从未进入过滤。
  const scenarioHardIds = application && application !== "generic"
    ? scenarioHardParams(usable, application) : [];
  const effectiveConstraints = { ...constraints };
  const scenarioApplied = [];
  for (const pid of scenarioHardIds) {
    if (effectiveConstraints[pid]) continue;              // 用户显式约束优先，不覆盖
    const p = usable.find(x => x.id === pid);
    if (!p) continue;
    // 场景硬约束语义：候选在该参数上不得劣于原型号（由比较语义决定方向）
    effectiveConstraints[pid] = { constraintType: "hard", scenario: application, notWorseThanOriginal: true };
    scenarioApplied.push({ paramId: pid, paramName: p.name, application });
  }
  const order = priorityOrder || (application && application !== "generic"
    ? applyScenarioPriority(usable, application)
    : usable.map(p => p.id));

  // ─── Step 2: AI 推荐 10 个候选 ───
  onProgress?.(`AI 正在搜索候选型号（目标 ${AI_CANDIDATE_COUNT} 个）...`);
  let candidatePNs = [], aiEliminated = [], lastCandidateError = null;
  const candCategory = {};   // 型号 → AI 声明的功能类别
  const candCk = `cand10:${partNumber}:${mode}:${scenario || ""}:${application}`;
  const candCached = cache.get(candCk);
  if (candCached) {
    candidatePNs = (candCached.candidates || []).map(c => (typeof c === "string" ? c : c?.pn)).filter(Boolean);
    aiEliminated = candCached.eliminated || [];
    Object.assign(candCategory, candCached.categories || {});
  } else {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const aiResult = await getCandidates(original, original.category, params, preferredManufacturers, mode, scenario, AI_CANDIDATE_COUNT, getApplicationHint(application));
        const rawCands = (aiResult.candidates || []).slice(0, AI_CANDIDATE_COUNT);
        candidatePNs = rawCands.map(c => (typeof c === "string" ? c : c?.pn)).filter(Boolean);
        rawCands.forEach(c => { if (c && typeof c === "object" && c.pn && c.functionCategory)
          candCategory[String(c.pn).toUpperCase()] = String(c.functionCategory).toLowerCase(); });
        aiEliminated = aiResult.eliminated || [];
        if (candidatePNs.length) break;
      } catch (e) {
        lastCandidateError = e;   // 保留上游原始异常，否则超时/限流会被误报成"无候选"
        console.warn(`[Pipeline] Candidates attempt ${attempt + 1} failed:`, e.message);
      }
      if (attempt < 1) await new Promise(r => setTimeout(r, 800));
    }
    if (candidatePNs.length) cache.set(candCk, { candidates: candidatePNs, eliminated: aiEliminated, categories: candCategory }, 86400);
  }
  // 双保险：程序化排除原型号本身及其封装/温度变体（同芯片不同后缀）
  const normPN = x => String(x).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const oN = normPN(partNumber);
  candidatePNs = candidatePNs.filter(pn => {
    const n = normPN(pn);
    if (!n) return false;
    if (n === oN || n.startsWith(oN) || oN.startsWith(n)) {
      aiEliminated.push({ pn, reason: "与原型号相同或为其封装变体" });
      return false;
    }
    return true;
  });
  // 去重
  const seen = new Set();
  candidatePNs = candidatePNs.filter(pn => { const n = normPN(pn); if (seen.has(n)) return false; seen.add(n); return true; });

  if (!candidatePNs.length) {
    // 区分"上游故障"与"上游正常但确实没有候选"
    if (lastCandidateError) {
      const err = new Error(`候选查询失败：${lastCandidateError.message}`);
      err.cause = lastCandidateError;
      err.upstream = true;
      throw err;
    }
    const err = new Error("AI 未返回任何候选型号");
    err.noCandidates = true;
    throw err;
  }
  console.log(`[Pipeline] AI recommended ${candidatePNs.length} candidates:`, candidatePNs.join(", "));

  // ─── Step 3: 候选参数获取（本地库批量优先）───
  onProgress?.(`正在校验 ${candidatePNs.length} 个候选（本地库优先）...`);

  // 3a. 批量查本地库
  const localBatch = await queryLocalDBBatch(candidatePNs);
  console.log(`[Pipeline] Local DB batch: ${Object.keys(localBatch).length}/${candidatePNs.length} hits`);

  const fetchResults = [];
  const unverified = [];

  // 3b. 先分离：本地库命中的直接用；未命中的收集起来准备并发查询
  const needLookup = [];
  for (const pnRaw of candidatePNs) {
    const pn = String(pnRaw).trim();
    if (!pn) continue;
    const localHit = localBatch[pn.toUpperCase()];
    if (localHit) {
      stats.localDbHits++;
      fetchResults.push(alignLocalParams(localHit, params));
    } else {
      // 先查缓存
      const cached = cache.get(`comp:${pn.toLowerCase()}`);
      if (cached) { fetchResults.push(cached); }
      else needLookup.push(pn);
    }
  }

  // 3c. 未命中的候选：并发查询（避免串行超时），且限制数量控制在 Vercel 时限内
  // 本地库已命中的越多，越不需要联网；这里最多并发查 MAX_AI_LOOKUP 个
  const MAX_AI_LOOKUP = 8;
  const toLookup = needLookup.slice(0, MAX_AI_LOOKUP);
  const skipped = needLookup.slice(MAX_AI_LOOKUP);
  skipped.forEach(pn => unverified.push({ partNumber: pn, manufacturer: "", reason: "超出单次查询上限，未校验" }));

  if (toLookup.length) {
    onProgress?.(`正在并发校验 ${toLookup.length} 个候选...`);
    const results = await Promise.allSettled(
      toLookup.map(pn => fetchComponentFromAPIs(pn, params))
    );
    results.forEach((r, i) => {
      const pn = toLookup[i];
      if (r.status === "fulfilled" && r.value) {
        cache.set(`comp:${pn.toLowerCase()}`, r.value, 7 * 86400);
        stats.aiLookups++;
        fetchResults.push(r.value);
      } else {
        unverified.push({ partNumber: pn, manufacturer: "", reason: "本地库未收录且联网查询失败" });
      }
    });
  }

  if (!fetchResults.length) throw new Error("所有候选型号均无法获取参数");

  // ─── Step 3.5: 功能类别一致性校验 ───
  // 教训：AI 曾把 AD8333(I/Q解调器) 当作 AD603(可变增益放大器) 的替代，
  // 且沿用了相邻型号的描述。功能类别不同的器件不可能是替代料，必须程序化拦截。
  // 描述通常比 ezPLM 的宽泛品类更精确（如 AD603 品类写"运算放大器"，描述才点明"可变增益放大器"）
  // 判定顺序：MPN 前缀（确定性）→ 主类别标记 → 描述 → 声明类别 → 品类字段
  const inferCat = o => {
    const byMpn = categoryByMpn(o?.partNumber || o?.mpn);
    if (byMpn) return byMpn;
    const text = `${o?.description || ""} ${o?.category || ""}`;
    for (const [cat, re] of PRIMARY_MARKERS) if (re.test(text)) return cat;
    return normFunc(o?.description || "") || normFunc(o?._functionCategory || "") || normFunc(o?.category || "");
  };
  const origCat = inferCat(original);
  for (const cand of fetchResults) {
    const candCat = inferCat(cand) || normFunc(candCategory[String(cand.partNumber).toUpperCase()] || "");
    cand._funcCategory = candCat;
    if (origCat && candCat && !funcCompatible(origCat, candCat)) {
      cand._categoryMismatch = { orig: origCat, cand: candCat };
    }
  }

  // ─── Step 3.6: 低成本模式需在门槛判定前拿到真实报价 ───
  // 此前行情在 pipeline 返回后才附加，导致低成本门槛读到 undefined，全部候选被误降级。
  if (mode === "lowCost" && fetchResults.length) {
    try {
      onProgress?.("正在获取分销商真实报价...");
      const { getMarketInfo } = require("./market");
      const mk = await getMarketInfo([partNumber, ...fetchResults.map(c => c.partNumber)].slice(0, 8));
      for (const c of fetchResults) c.market = mk.parts?.[c.partNumber] || null;
      original._market = mk.parts?.[partNumber] || null;
    } catch (e) { console.warn("[Pipeline] 低成本报价获取失败:", e.message); }
  }

  // ─── Step 4: 算法评分 + 淘汰 + 排序 ───
  onProgress?.("正在计算匹配评分并筛选...");
  const { calculateScore } = require("./scoring-node");
  const scored = [];
  const lowScored = [];   // 低于淘汰线的候选（若最终无合格者，从中救回Top3）
  const eliminated = [
    ...aiEliminated.map(e => ({ partNumber: e.pn || e.partNumber || "", manufacturer: "", reason: e.reason || "AI 排除", stage: "ai_filter" })),
    // 查询失败的候选不是"技术上不合适"，而是"没查到数据"，需分开说明
    ...unverified.map(u => ({ ...u, stage: "lookup_failed" })),
  ];

  for (const cand of fetchResults) {
    const result = calculateScore(params, cand, order, effectiveConstraints);

    // 功能类别不符 → 直接淘汰（替代料的前提是同类器件）
    if (cand._categoryMismatch) {
      eliminated.push({ partNumber: cand.partNumber, manufacturer: cand.manufacturer,
        reason: `功能类别不符：原型号为「${cand._categoryMismatch.orig}」，该型号为「${cand._categoryMismatch.cand}」，不可作为替代`, stage: "category" });
      continue;
    }
    // 硬约束淘汰
    // 字段名曾写成 result.eliminated/elimReason（scoring 实际返回 rejected/rejectReason），
    // 导致这个分支永远不触发，硬约束违规的候选混进了低分池而非被明确淘汰。
    if (result.rejected) {
      eliminated.push({ partNumber: cand.partNumber, manufacturer: cand.manufacturer,
        reason: result.rejectReason || "不满足硬约束", stage: "hard_constraint" });
      continue;
    }
    // 分数过低：先收集，最后统一决定是否淘汰（避免纯AI模式下全军覆没）
    if (result.overallScore < ELIMINATION_THRESHOLD) {
      lowScored.push({ cand, result });
      continue;
    }

    // ── 替代模式确定性门槛（此前仅靠提示词，无程序化约束）──
    const gate = applyProfile(mode, { original, candidate: cand, scoreResult: result, procurement });
    if (!gate.pass) {
      eliminated.push({ partNumber: cand.partNumber, manufacturer: cand.manufacturer, reason: gate.reason, stage: "mode_gate" });
      continue;
    }
    if (gate.downgrade === "NEEDS_VERIFICATION") {
      result.needsVerification = true;
      (result.verifyReasons ||= []).push(gate.reason);
      result.replacementLevel = { level: "NEEDS_VERIFICATION", label: "待核验", color: "#8a8a8a", desc: gate.reason };
    }

    const isPreferred = preferredManufacturers.some(m =>
      cand.manufacturer.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(cand.manufacturer.toLowerCase())
    );
    scored.push({
      partNumber: cand.partNumber, manufacturer: cand.manufacturer, description: cand.description,
      internalPN: cand.internalPN || "", inPLM: cand._source === "ezplm", approved: cand.approved || false,
      isPreferred, overallScore: result.overallScore,
      authoritative: isAuthoritative(cand),
      // 硬约束未知一律 fail-closed：ALT-003 中 Flash 设为硬约束但候选该字段为 N/A，
      // 评分层已标 NEEDS_VERIFICATION，但此前 pipeline 未据此拦截，仍进了正式 Top N。
      needsVerification: !!result.needsVerification,
      verifyReasons: result.verifyReasons || [],
      market: cand.market || null,
      extraParams: cand.extraParams || [],
      technical: result.technical, evidenceCoverage: result.evidenceCoverage,
      sourceConfidence: result.sourceConfidence, confidence: result.confidence,
      pinVerified: result.pinVerified,
      paramScores: result.paramScores, dimensionScores: result.dimensionScores,
      replacementLevel: result.replacementLevel,
      dataSource: cand._source === "ezplm" ? "本地数据库" : cand._source === "digikey" ? "DigiKey" : "AI搜索",
    });
  }

  // 淘汰保底：合格者为空时，从低分候选中救回Top3（其P0/N/X等级已表达低可信度）
  // 全部候选都没进 scored 时，尽量给出可解释的结果而非空白
  if (!scored.length && lowScored.length) {
    lowScored.sort((a, b) => b.result.overallScore - a.result.overallScore);
    for (const { cand, result } of lowScored.slice(0, 3)) {
      // ── 替代模式确定性门槛（此前仅靠提示词，无程序化约束）──
    const gate = applyProfile(mode, { original, candidate: cand, scoreResult: result, procurement });
    if (!gate.pass) {
      eliminated.push({ partNumber: cand.partNumber, manufacturer: cand.manufacturer, reason: gate.reason, stage: "mode_gate" });
      continue;
    }
    if (gate.downgrade === "NEEDS_VERIFICATION") {
      result.needsVerification = true;
      (result.verifyReasons ||= []).push(gate.reason);
      result.replacementLevel = { level: "NEEDS_VERIFICATION", label: "待核验", color: "#8a8a8a", desc: gate.reason };
    }

    const isPreferred = preferredManufacturers.some(m =>
        cand.manufacturer.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(cand.manufacturer.toLowerCase()));
      scored.push({
        partNumber: cand.partNumber, manufacturer: cand.manufacturer, description: cand.description,
        internalPN: cand.internalPN || "", inPLM: cand._source === "ezplm", approved: cand.approved || false,
        isPreferred, overallScore: result.overallScore,
        authoritative: isAuthoritative(cand),
        needsVerification: !!result.needsVerification,
        verifyReasons: result.verifyReasons || [],
        technical: result.technical, evidenceCoverage: result.evidenceCoverage,
        sourceConfidence: result.sourceConfidence, confidence: result.confidence,
        pinVerified: result.pinVerified, _lowConfidence: true,
        paramScores: result.paramScores, dimensionScores: result.dimensionScores,
        replacementLevel: result.replacementLevel,
        dataSource: cand._source === "ezplm" ? "本地数据库" : "AI搜索",
      });
    }
    for (const { cand, result } of lowScored.slice(3)) {
      eliminated.push({ partNumber: cand.partNumber, manufacturer: cand.manufacturer, reason: `综合可信度过低 (${result.overallScore}分)` });
    }
  } else {
    for (const { cand, result } of lowScored) {
      eliminated.push({ partNumber: cand.partNumber, manufacturer: cand.manufacturer, reason: `综合可信度过低 (${result.overallScore}分 < ${ELIMINATION_THRESHOLD}分)` });
    }
  }

  // 低成本模式：有真实报价者按价格升序，其余按可信度
  if (mode === "lowCost") {
    scored.sort((a, b) => {
      const pa = a.market?.source === "distributor_api" ? (a.market.priceUSD100 ?? a.market.priceUSD1) : null;
      const pb = b.market?.source === "distributor_api" ? (b.market.priceUSD100 ?? b.market.priceUSD1) : null;
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return b.confidence - a.confidence;
    });
    return {
      pipeline: { dataPath: original._dataPath, candidatesRequested: AI_CANDIDATE_COUNT,
        candidatesReceived: candidatePNs.length, candidatesVerified: fetchResults.length,
        candidatesEliminated: eliminated.length, finalCount: Math.min(scored.length, FINAL_RESULT_COUNT),
        localDbHits: stats.localDbHits, aiLookups: stats.aiLookups,
        executionTimeMs: Date.now() - startTime, application, mode,
        modeNote: PROFILES[mode]?.note || "", scenarioConstraints: scenarioApplied,
        sortedBy: "real_distributor_price" },
      original,
      recommendations: scored.filter(x => x.authoritative && !x.needsVerification).slice(0, FINAL_RESULT_COUNT),
      pendingVerification: scored.filter(x => !x.authoritative || x.needsVerification).slice(0, FINAL_RESULT_COUNT).map(x => ({
        ...x,
        pendingReason: x.needsVerification
          ? (x.verifyReasons?.[0] || "硬约束字段缺失，无法验证是否满足")
          : "该型号未获权威来源确认，参数来自 AI，需人工核对",
        replacementLevel: { level: "NEEDS_VERIFICATION", label: "待核验", color: "#8a8a8a",
          desc: x.needsVerification ? "硬约束未知，按 fail-closed 处理" : "无权威来源确认" } })),
      eliminated,
    };
  }

  // 排序: 综合分优先，分差<=3 时优选厂商靠前
  scored.sort((a, b) => {
    const diff = b.overallScore - a.overallScore;
    if (Math.abs(diff) <= 3) {
      if (a.inPLM !== b.inPLM) return a.inPLM ? -1 : 1;          // 本地库已有的优先
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
    }
    return diff;
  });

  return {
    pipeline: {
      dataPath: original._dataPath,                              // local_db | cache | ai_search
      candidatesRequested: AI_CANDIDATE_COUNT,
      candidatesReceived: candidatePNs.length,
      candidatesVerified: fetchResults.length,
      candidatesEliminated: eliminated.length,
      finalCount: Math.min(scored.length, FINAL_RESULT_COUNT),
      localDbHits: stats.localDbHits,
      aiLookups: stats.aiLookups,
      executionTimeMs: Date.now() - startTime,
      application,
      mode, modeNote: PROFILES[mode]?.note || "",
      scenarioConstraints: scenarioApplied,
    },
    original,
    // 未经权威来源验证的候选不得占据正式 Top N，单列"待核验候选"
    recommendations: scored.filter(x => x.authoritative && !x.needsVerification).slice(0, FINAL_RESULT_COUNT),
    pendingVerification: scored.filter(x => !x.authoritative || x.needsVerification).slice(0, FINAL_RESULT_COUNT).map(x => ({
      ...x,
      pendingReason: x.needsVerification
        ? (x.verifyReasons?.[0] || "硬约束字段缺失，无法验证是否满足，按 fail-closed 处理")
        : "该型号未获 ezPLM 或分销商精确匹配确认，参数来自 AI，需人工核对 datasheet 后方可采用",
      replacementLevel: { level: "NEEDS_VERIFICATION", label: "待核验", color: "#8a8a8a",
        desc: x.needsVerification ? "硬约束未知，不进入正式推荐" : "无权威来源确认该型号，不进入正式推荐" },
    })),
    eliminated,
  };
}

/**
 * 本地库数据的参数 ID 对齐
 * 本地库的 param_N 顺序可能与原始器件不同，按参数名匹配对齐
 */
/**
 * 把 ezPLM 候选记录的参数对齐到原型号参数 id。
 * 此前用朴素 includes 匹配，遇到「输入噪声密度[典型值](nV/√Hz)」这类带限定词与
 * 单位后缀的 ezPLM 命名会全部失配，导致候选明明有数据却显示 N/A、覆盖率仅 33%。
 */
function alignLocalParams(localPart, referenceParams) {
  const src = localPart.parameters || [];
  const aligned = alignParams(src, referenceParams,
    { source: "ezplm", sourceLabel: "本地数据库", confidence: "high" });
  // 诊断：候选自身有、但原型号参数集里没有对应项的参数
  const usedNames = new Set(Object.values(aligned).map(a => a.matchedName).filter(Boolean));
  const extraParams = src.filter(p => !usedNames.has(p.name))
    .map(p => ({ name: p.name, value: p.value })).slice(0, 12);
  return { ...localPart, parameters: aligned, extraParams };
}

module.exports = { runPipeline, resolveOriginalPart };
