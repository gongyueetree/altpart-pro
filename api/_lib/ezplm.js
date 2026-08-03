// ezplm.js — ezPLM 数据层（真实官方 API + 防御式字段映射）
//
// 官方仅开放两个只读端点（经 api/ezplm.js 签名代理）：
//   parts?keyword=            物料搜索
//   reference-designs?partlibId=  参考设计
// 未配置 EZPLM_API_KEY 时自动回落内置演示数据。

const { callEzplm } = require("../ezplm");
const { cache } = require("./cache");
const { resolveIdentity, identityCacheKey, guardResource, splitMpn, dedupeVariants } = require("./part-identity");

/* ---------- 防御式取值（官方未给精确结构，兼容多形态） ---------- */
const str = v => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function pickName(v) {
  if (typeof v === "string") return str(v);
  if (Array.isArray(v)) return pickName(v[0]);
  if (v && typeof v === "object") return str(v.name) ?? str(v.footprint) ?? str(v.value) ?? str(v.title);
  return undefined;
}
function pickUrl(v) {
  if (typeof v === "string") return /^https?:\/\//.test(v) ? v : undefined;
  if (Array.isArray(v)) return pickUrl(v[0]);
  if (v && typeof v === "object") return pickUrl(v.url) ?? pickUrl(v.link) ?? pickUrl(v.file) ?? pickUrl(v.path) ?? pickUrl(v.href);
  return undefined;
}
function pickAttrs(v) {
  const out = {};
  if (Array.isArray(v)) {
    for (const it of v) {
      if (it && typeof it === "object") {
        const k = str(it.name) ?? str(it.key) ?? str(it.label);
        const val = str(it.value) ?? (typeof it.value === "number" ? String(it.value) : undefined);
        if (k && val) out[k] = val;
      }
      if (Object.keys(out).length >= 20) break;
    }
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      const sv = typeof val === "string" ? val : typeof val === "number" ? String(val) : undefined;
      if (sv) out[k] = sv;
      if (Object.keys(out).length >= 20) break;
    }
  }
  return out;
}

/** 对象名取值：{id,name} | 字符串 */
function objName(v) {
  if (typeof v === "string") return str(v);
  if (v && typeof v === "object") return str(v.name) ?? str(v.title) ?? str(v.label);
  return undefined;
}
/** 文件对象取值：{url,fname} | 字符串url */
function fileOf(v) {
  if (typeof v === "string") return /^https?:\/\//.test(v) ? { url: v, fname: "" } : null;
  if (v && typeof v === "object") {
    const url = str(v.url) ?? str(v.link) ?? str(v.href);
    if (url) return { url, fname: str(v.fname) ?? str(v.name) ?? "" };
  }
  return null;
}

/** 从封装名解析 mm 尺寸，如 MSOP-8_3x3mm_P0.65mm → {w:3,h:3} */
function sizeFromFootprintName(name) {
  if (!name) return null;
  const m = String(name).match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm/i);
  return m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : null;
}

/**
 * ezPLM 原始物料 → 标准 PartIR
 * 已按真实返回结构编写（manufacturer/category 为 {id,name}；
 * footprint 含 kicadModFile/stepFile；pdf 为 {url,fname}；attributes 为 [{name,value}]）
 */
function mapEzplmPart(raw) {
  const id = str(raw.id) ?? "";
  const mpn = str(raw.mpn) ?? str(raw.model) ?? str(raw.partNumber) ?? id;
  const manufacturer = objName(raw.manufacturer) ?? "";
  const category = objName(raw.category) ?? "";
  const description = str(raw.description) ?? "";

  const fpObj = raw.footprint && typeof raw.footprint === "object" ? raw.footprint : null;
  const footprint = objName(raw.footprint);
  const kicadMod = fileOf(fpObj?.kicadModFile) ?? fileOf(raw.kicadModFile) ?? fileOf(fpObj?.modFile);
  const stepFile = fileOf(fpObj?.stepFile) ?? fileOf(raw.stepFile) ?? fileOf(fpObj?.wrlFile) ?? fileOf(raw.wrlFile);
  // 符号文件真实位置：symbol.kicadSymFile.url（此前只找顶层 url 导致漏读）
  const symObj = raw.symbol && typeof raw.symbol === "object" ? raw.symbol : null;
  const symbolFile = fileOf(symObj?.kicadSymFile) ?? fileOf(raw.kicadSymFile)
                  ?? fileOf(symObj?.file) ?? fileOf(raw.symbolFile) ?? fileOf(raw.symbol);
  const pdfFile = fileOf(raw.pdf) ?? fileOf(raw.datasheet);

  // attributes: [{name,value}] → 标准 parameters
  const parameters = [];
  let i = 0;
  const attrs = Array.isArray(raw.attributes) ? raw.attributes : [];
  for (const a of attrs) {
    const name = str(a?.name), value = str(a?.value) ?? (typeof a?.value === "number" ? String(a.value) : undefined);
    if (!name || !value) continue;
    // 参数名里的单位提取：Iq[典型值](µA) → unit=µA
    const um = name.match(/\(([^)]+)\)\s*$/);
    parameters.push({
      id: `param_${++i}`,
      name, nameEn: name,
      value, unit: um ? um[1] : "",
      source: "ezplm", sourceLabel: "ezPLM", confidence: "high", verified: true,
    });
  }
  if (footprint && !parameters.some(p => /封装|package/i.test(p.name))) {
    parameters.push({ id: `param_${++i}`, name: "封装", nameEn: "Package", value: footprint, unit: "",
      source: "ezplm", sourceLabel: "ezPLM", confidence: "high", verified: true });
  }

  const size = sizeFromFootprintName(footprint);

  return {
    partNumber: mpn, ezplmId: id, manufacturer, category, description,
    parameters,
    footprint, footprintSize: size,
    datasheetUrl: pdfFile?.url,
    datasheetFileName: pdfFile?.fname || "",
    productUrl: str(raw.officialUrl),
    symbolUrl: symbolFile?.url || null,
    symbolFileName: symbolFile?.fname || "",
    footprintFileUrl: kicadMod?.url || null,
    footprintFileName: kicadMod?.fname || "",
    model3dUrl: stepFile?.url || null,
    model3dFileName: stepFile?.fname || "",
    imageUrl: pickUrl(raw.image) ?? pickUrl(raw.photo),
    approved: true,
    _source: "ezplm",
  };
}

/* ---------- 查询 ---------- */

async function ezplmConfigured() {
  return !!process.env.EZPLM_API_KEY;
}

/**
 * 按型号查询。
 *
 * 两条纪律必须同时满足（v6.3.0 只做到前一条，导致基础型号查不到数据）：
 *  1. 不静默替换：输入 TL431 不得悄悄变成 TL431-1
 *  2. 不丢数据：输入 AD8331（基础型号）时，ezPLM 里的 AD8331ARQZ 等变体必须被找出来供用户确认
 *
 * 因此：exact 命中直接返回；否则返回同基础器件的变体集合并标 needsVariantConfirm，
 * 由上层决定是让用户选、还是先用最佳变体的数据但明确标注。
 */
async function queryLocalDB(partNumber, opts = {}) {
  const probe = `ez:probe:${String(partNumber).toLowerCase()}`;
  const cachedProbe = cache.get(probe);
  if (cachedProbe !== null && cachedProbe !== undefined) {
    if (cachedProbe === false) return null;
    if (cachedProbe.needsVariantConfirm && opts.exactOnly) return null;
    return cachedProbe;
  }

  if (await ezplmConfigured()) {
    const base = splitMpn(partNumber).baseDevice;

    // ── 两段式检索 ──
    // 只用基础型号搜会漏：TL431 系列在 ezPLM 有数百个订货号，
    // pageSize=30 的结果里可能不含 TL431ACDBVRG4，于是被误判为"未收录"。
    // 因此先用**完整型号**精确查，命中即用；未命中再用基础型号找同族变体。
    let mapped = [];
    const exactSearch = await callEzplm("parts", { keyword: partNumber, pageSize: 20 });
    if (exactSearch.ok && exactSearch.data.length) mapped = exactSearch.data.map(mapEzplmPart);

    let identity = mapped.length ? resolveIdentity(partNumber, mapped, { sourceType: "ezplm" }) : null;

    // 完整型号没查到精确匹配 → 退回基础型号，扩大范围找同族
    if ((!identity || identity.matchType !== "exact") && base && base !== partNumber) {
      const familySearch = await callEzplm("parts", { keyword: base, pageSize: 40 });
      if (familySearch.ok && familySearch.data.length) {
        const familyMapped = familySearch.data.map(mapEzplmPart);
        // 合并去重，保留先前结果
        const seen = new Set(mapped.map(m => String(m.partNumber).toUpperCase()));
        for (const m of familyMapped)
          if (!seen.has(String(m.partNumber).toUpperCase())) { mapped.push(m); seen.add(String(m.partNumber).toUpperCase()); }
        identity = resolveIdentity(partNumber, mapped, { sourceType: "ezplm" });
      }
    }

    // 同一厂商下相同完整 MPN 只保留一条（ALT-002：LM358AD / TL431ACD 曾各出现两次且描述冲突）
    const dd = dedupeVariants(mapped);
    mapped = dd.records;
    if (dd.conflicts.length) console.warn(`[ezplm] ${partNumber}: ${dd.conflicts.length} 组同 MPN 记录内容冲突`);
    if (identity) identity = resolveIdentity(partNumber, mapped, { sourceType: "ezplm" });

    const r = { ok: mapped.length > 0, data: mapped };
    if (r.ok && r.data.length) {
      identity = identity || resolveIdentity(partNumber, mapped, { sourceType: "ezplm" });

      if (identity.matchType === "exact" && identity.record?.parameters?.length) {
        const out = { ...identity.record, identity, _matchType: "exact" };
        cache.set(identityCacheKey("ez:part", identity), out, 7 * 86400);
        cache.set(probe, out, 7 * 86400);
        return out;
      }

      // 无 exact：找出同基础器件的变体，交给上层做确认，绝不改写用户输入
      const nrm = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const wantBase = nrm(base);
      const sameFamily = mapped.filter(m => nrm(splitMpn(m.partNumber).baseDevice) === wantBase);
      const pool = sameFamily.length ? sameFamily : mapped;
      if (pool.length) {
        const best = pool.find(m => m.parameters?.length) || pool[0];
        const out = {
          ...best,
          partNumber: best.partNumber,          // 保留真实变体号
          requestedMpn: partNumber,             // 同时保留用户输入，UI 需同时展示
          identity: { ...identity, matchType: sameFamily.length ? "package_variant" : "base_device" },
          _matchType: sameFamily.length ? "package_variant" : "base_device",
          needsVariantConfirm: true,
          variants: pool.map(m => ({ pn: m.partNumber, package: m.footprint || "",
            note: m.description || "", ezplmId: m.ezplmId,
            manufacturer: m.manufacturer || "",
            duplicateConflict: !!m.duplicateConflict, duplicateCount: m.duplicateCount || 0,
          })).slice(0, 12),
          duplicateConflicts: dd.conflicts,
        };
        cache.set(probe, out, 86400);
        return opts.exactOnly ? null : out;
      }
    }
    cache.set(probe, false, 3600);
    return null;
  }
  return MOCK_LOCAL_DB[partNumber.toUpperCase()] || null;
}

/** 关键词搜索（返回多个候选，供选型/变体确认） */
async function searchParts(keyword, pageSize = 20) {
  if (!(await ezplmConfigured())) {
    const k = keyword.toUpperCase();
    return Object.values(MOCK_LOCAL_DB).filter(p => p.partNumber.toUpperCase().includes(k));
  }
  const ck = `ez:search:${keyword.toLowerCase()}:${pageSize}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const r = await callEzplm("parts", { keyword, pageSize });
  const items = r.ok ? r.data.map(mapEzplmPart) : [];
  if (items.length) cache.set(ck, items, 86400);
  return items;
}

/** 批量查询（官方无批量端点 → 并发单查） */
async function queryLocalDBBatch(partNumbers) {
  const map = {};
  const results = await Promise.allSettled(partNumbers.map(pn => queryLocalDB(pn)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) map[String(partNumbers[i]).toUpperCase()] = r.value;
  });
  return map;
}

/** 参考设计（官方端点，需 ezplmId） */
async function getReferenceDesigns(ezplmId, pageSize = 10) {
  if (!ezplmId || !(await ezplmConfigured())) return [];
  const ck = `ez:refdes:${ezplmId}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const r = await callEzplm("reference-designs", { partlibId: ezplmId, pageSize });
  const list = r.ok ? r.data.map(d => ({
    name: str(d.name) ?? "参考设计",
    link: pickUrl(d.link) ?? pickUrl(d.url),
    image: pickUrl(d.image),
    description: str(d.description),
  })) : [];
  if (list.length) cache.set(ck, list, 7 * 86400);
  return list;
}

/** 器件详情（含参考设计与可下载资源） */
async function queryPartDetail(partNumber) {
  const base = await queryLocalDB(partNumber);
  if (!base) return null;
  const identity = base.identity || resolveIdentity(partNumber, [base], { sourceType: "ezplm" });

  /** 展示前逐个校验资源确属该器件（拦 LM2904BAIPWR.pdf / LM258DT.pdf 这类异物） */
  const keep = (res, label) => {
    if (!res?.url) return null;
    const g = guardResource(identity, { ...res, manufacturer: base.manufacturer, partNumber: base.partNumber });
    if (!g.ok) {
      console.warn(`[ezplm] ${label} 被身份守卫拒绝: ${g.reason}`);
      return { blocked: true, code: g.code, reason: g.reason };
    }
    return res;
  };
  const referenceDesigns = await getReferenceDesigns(base.ezplmId);

  // ── 顶层资源字段同样必须过守卫（ALT-001）──
  // 此前只守卫 downloads 数组，而前端用的是 datasheetUrl / productUrl 等顶层字段，
  // 于是 ST 的官网链接与 LM258DT.pdf 仍会显示在 TI 的 LM358AM/NOPB 页面上。
  const blocked = [];
  const guardUrl = (url, fname, label) => {
    if (!url) return null;
    const g = guardResource(identity,
      { url, fname, manufacturer: base.manufacturer, partNumber: base.partNumber });
    if (g.ok) return url;
    blocked.push({ type: label, url, fname, code: g.code, reason: g.reason });
    console.warn(`[ezplm] ${label} 被身份守卫拒绝: ${g.reason}`);
    return null;
  };
  const safeDatasheet = guardUrl(base.datasheetUrl, base.datasheetFileName, "datasheet");
  const safeSymbol = guardUrl(base.symbolUrl, base.symbolFileName, "symbol");
  const safeFootprint = guardUrl(base.footprintFileUrl, base.footprintFileName, "footprint");
  const safeModel3d = guardUrl(base.model3dUrl, base.model3dFileName, "model3d");
  const safeProduct = guardUrl(base.productUrl, "", "productUrl");

  return {
    ...base,
    // 用守卫后的值覆盖顶层字段，未通过的置 null 而非留旧值
    datasheetUrl: safeDatasheet,
    symbolUrl: safeSymbol,
    footprintFileUrl: safeFootprint,
    model3dUrl: safeModel3d,
    productUrl: safeProduct,
    referenceDesigns,
    identity,
    downloads: [
      safeDatasheet && { type: "datasheet", label: "Datasheet (PDF)", url: safeDatasheet, fname: base.datasheetFileName || "" },
      safeSymbol && { type: "symbol", label: "原理图符号", url: safeSymbol, fname: base.symbolFileName || "" },
      safeFootprint && { type: "footprint", label: "PCB 封装 (KiCad)", url: safeFootprint, fname: base.footprintFileName },
      safeModel3d && { type: "model3d", label: "3D 模型 (STEP)", url: safeModel3d, fname: base.model3dFileName },
    ].filter(Boolean),
    blockedResources: blocked,
    suppliers: [],   // 由 /api/v2/market 提供实时价格库存
    inventory: null,
  };
}

/* ---------- 演示数据（未配置 API Key 时） ---------- */
const MOCK_LOCAL_DB = {
  "STM32F103C8T6": {
    partNumber: "STM32F103C8T6", ezplmId: "", manufacturer: "STMicroelectronics",
    category: "微控制器", description: "主流型Cortex-M3微控制器", approved: true, _source: "ezplm",
    footprint: "LQFP-48",
    parameters: [
      { id:"param_1", name:"内核架构", nameEn:"Core Architecture", value:"ARM Cortex-M3", unit:"", source:"ezplm", sourceLabel:"ezPLM", confidence:"high", verified:true },
      { id:"param_2", name:"工作主频", nameEn:"Max CPU Frequency", value:"72", unit:"MHz", source:"ezplm", sourceLabel:"ezPLM", confidence:"high", verified:true },
      { id:"param_3", name:"Flash容量", nameEn:"Flash Size", value:"64", unit:"KB", source:"ezplm", sourceLabel:"ezPLM", confidence:"high", verified:true },
      { id:"param_4", name:"RAM容量", nameEn:"SRAM Size", value:"20", unit:"KB", source:"ezplm", sourceLabel:"ezPLM", confidence:"high", verified:true },
      { id:"param_5", name:"工作电压", nameEn:"Operating Voltage", value:"2.0-3.6", unit:"V", source:"ezplm", sourceLabel:"ezPLM", confidence:"high", verified:true },
      { id:"param_6", name:"I/O数量", nameEn:"Number of I/Os", value:"37", unit:"", source:"ezplm", sourceLabel:"ezPLM", confidence:"high", verified:true },
      { id:"param_7", name:"封装", nameEn:"Package", value:"LQFP-48", unit:"", source:"ezplm", sourceLabel:"ezPLM", confidence:"high", verified:true },
      { id:"param_8", name:"工作温度范围", nameEn:"Operating Temperature", value:"-40 to 85", unit:"°C", source:"ezplm", sourceLabel:"ezPLM", confidence:"high", verified:true },
    ],
  },
};

module.exports = {
  queryLocalDB, queryLocalDBBatch, queryPartDetail, searchParts,
  getReferenceDesigns, mapEzplmPart, ezplmConfigured,
};
