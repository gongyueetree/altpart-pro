// ezplm.js — ezPLM 数据层（真实官方 API + 防御式字段映射）
//
// 官方仅开放两个只读端点（经 api/ezplm.js 签名代理）：
//   parts?keyword=            物料搜索
//   reference-designs?partlibId=  参考设计
// 未配置 EZPLM_API_KEY 时自动回落内置演示数据。

const { callEzplm } = require("../ezplm");
const { cache } = require("./cache");

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

/** ezPLM 原始物料 → 标准 PartIR */
function mapEzplmPart(raw) {
  const id = str(raw.id) ?? str(raw.partlibId) ?? "";
  const mpn = str(raw.mpn) ?? str(raw.model) ?? str(raw.partNumber) ?? str(raw.name) ?? id;
  const manufacturer = str(raw.manufacturer) ?? str(raw.vendor) ?? str(raw.brand) ?? "";
  const attrs = pickAttrs(raw.attributes ?? raw.params ?? raw.specs);
  const description = str(raw.description) ?? str(raw.productName) ?? str(raw.title) ?? "";
  const footprint = pickName(raw.footprint) ?? attrs["封装"] ?? attrs["Package"];

  // attributes → 标准 parameters 数组
  const parameters = [];
  let i = 0;
  for (const [k, v] of Object.entries(attrs)) {
    parameters.push({
      id: `param_${++i}`, name: k, nameEn: k, value: v, unit: "",
      source: "ezplm", sourceLabel: "ezPLM", confidence: "high", verified: true,
    });
  }
  if (footprint && !parameters.some(p => /封装|package/i.test(p.name))) {
    parameters.push({ id: `param_${++i}`, name: "封装", nameEn: "Package", value: footprint, unit: "",
      source: "ezplm", sourceLabel: "ezPLM", confidence: "high", verified: true });
  }

  return {
    partNumber: mpn, ezplmId: id, manufacturer,
    category: str(raw.category) ?? "", description,
    parameters,
    footprint,
    datasheetUrl: pickUrl(raw.pdf) ?? pickUrl(raw.datasheet),
    imageUrl: pickUrl(raw.image) ?? pickUrl(raw.photo),
    symbolUrl: pickUrl(raw.symbol),
    footprintUrl: pickUrl(raw.footprintFile) ?? pickUrl(raw.footprint3d),
    model3dUrl: pickUrl(raw.model3d) ?? pickUrl(raw.step),
    productUrl: pickUrl(raw.link) ?? pickUrl(raw.url),
    approved: true,
    _source: "ezplm",
  };
}

/* ---------- 查询 ---------- */

async function ezplmConfigured() {
  return !!process.env.EZPLM_API_KEY;
}

/** 按型号精确查询（本地库优先路径用） */
async function queryLocalDB(partNumber) {
  const ck = `ez:part:${partNumber.toLowerCase()}`;
  const hit = cache.get(ck);
  if (hit !== null && hit !== undefined) return hit || null;

  if (await ezplmConfigured()) {
    const r = await callEzplm("parts", { keyword: partNumber, pageSize: 20 });
    if (r.ok && r.data.length) {
      const norm = x => String(x).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const target = norm(partNumber);
      // 精确匹配优先，其次前缀匹配
      const exact = r.data.find(d => norm(str(d.mpn) ?? str(d.model) ?? "") === target);
      const prefix = r.data.find(d => norm(str(d.mpn) ?? str(d.model) ?? "").startsWith(target));
      const picked = exact || prefix;
      if (picked) {
        const mapped = mapEzplmPart(picked);
        if (mapped.parameters.length) { cache.set(ck, mapped, 7 * 86400); return mapped; }
      }
    }
    cache.set(ck, false, 3600);   // 记录未命中，避免反复打上游
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
  const referenceDesigns = await getReferenceDesigns(base.ezplmId);
  return {
    ...base,
    referenceDesigns,
    downloads: [
      base.datasheetUrl && { type: "datasheet", label: "Datasheet (PDF)", url: base.datasheetUrl },
      base.symbolUrl && { type: "symbol", label: "原理图符号", url: base.symbolUrl },
      base.footprintUrl && { type: "footprint", label: "PCB 封装", url: base.footprintUrl },
      base.model3dUrl && { type: "model3d", label: "3D 模型 (STEP)", url: base.model3dUrl },
    ].filter(Boolean),
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
