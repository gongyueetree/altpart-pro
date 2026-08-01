// part-identity.js — 器件身份解析与守卫
//
// 线上实测暴露的问题：
//  · 输入 TL431 → 结果标题变成 TL431-1（模糊匹配悄悄替换了用户输入）
//  · LM358ADR 一个页面里混入 ST / TI / LM258DT.pdf / LM2904BAIPWR.pdf 四种身份
//  · 输入 AD8331ARQ-REEL7，变体列表里没有该精确型号
//
// 根因：没有统一身份对象；模糊匹配结果冒充 exact；缓存键只有型号，不含厂商与封装。
// 本模块提供唯一权威身份，所有资料/详情/eCAD 必须绑定它。

/** @typedef {'exact'|'package_variant'|'base_device'|'fuzzy'|'unverified'} MatchType */

const norm = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 常见订货后缀：包装/卷带/环保/温度等级 —— 这些不改变芯片本体 */
const ORDERABLE_SUFFIX = /[-_/]?(REEL\d*|RL|R7|TR|T\/?R|2K5|1K|G4|E4|TG4|NOPB|PBF|EP|ROHS|CT|CT-ND)$/i;

/**
 * 拆解 MPN：基础型号 + 订货后缀
 * TPS62160DGKR → base TPS62160, suffix DGKR(封装码)
 * AD8331ARQ-REEL7 → base AD8331ARQ, suffix REEL7(包装)
 */
function splitMpn(mpn) {
  const raw = String(mpn || "").trim();
  let body = raw, orderableSuffix = null;
  const m = raw.match(ORDERABLE_SUFFIX);
  if (m && m.index > 3) { orderableSuffix = m[1]; body = raw.slice(0, m.index).replace(/[-_/]$/, ""); }
  // 基础器件：字母前缀 + 数字（保留 STM32F103 这类系列特征）
  const bm = body.toUpperCase().match(/^([A-Z]{1,4}\d{2,6}(?:[A-Z]\d{2,4})?)/);
  const baseDevice = bm ? bm[1] : body.toUpperCase();
  return { requested: raw, body, baseDevice, orderableSuffix };
}

/**
 * 由候选记录集合解析身份。**不做静默替换**：
 * 没有 exact 命中时 matchType 明确标为 base_device / fuzzy，由调用方决定是否让用户确认。
 *
 * @param requestedMpn 用户输入
 * @param records 上游返回的候选（需含 partNumber/manufacturer/footprint 等）
 * @param opts { sourceType }
 */
function resolveIdentity(requestedMpn, records = [], opts = {}) {
  const parts = splitMpn(requestedMpn);
  const target = norm(requestedMpn);
  const targetBody = norm(parts.body);

  const of = r => norm(r?.partNumber || r?.mpn || "");
  const exact = records.find(r => of(r) === target);
  const bodyHit = !exact && records.find(r => of(r) === targetBody);
  // 同一基础器件的其它订货变体
  const variantHit = !exact && !bodyHit &&
    records.find(r => norm(splitMpn(r?.partNumber || r?.mpn || "").body) === targetBody);

  const picked = exact || bodyHit || variantHit || null;
  /** @type {MatchType} */
  let matchType = "unverified";
  if (exact) matchType = "exact";
  else if (bodyHit) matchType = "exact";              // 仅差包装后缀，视为同一订货体
  else if (variantHit) matchType = "package_variant";
  else if (records.length) matchType = "base_device";

  return {
    requestedMpn: parts.requested,
    normalizedMpn: target,
    exactMpn: picked && (exact || bodyHit) ? (picked.partNumber || picked.mpn) : null,
    baseDevice: parts.baseDevice,
    orderableSuffix: parts.orderableSuffix,
    manufacturerId: picked?.manufacturerId || null,
    manufacturerName: picked?.manufacturer || null,
    packageVariantId: picked?.ezplmId || picked?.variantId || null,
    packageCode: picked?.footprint || null,
    matchType,
    sourceType: opts.sourceType || (picked ? "ezplm" : null),
    record: picked || null,
  };
}

/**
 * 缓存键：必须含厂商与封装，否则会出现 LM358 式跨厂商污染。
 * 厂商需先 canonical 化，否则 "TI" 与 "Texas Instruments" 会产生两条缓存，
 * 既浪费又可能让同一器件在不同页面拿到不同数据。
 */
function identityCacheKey(prefix, identity) {
  const id = identity || {};
  const parts = [
    prefix,
    norm(id.exactMpn || id.requestedMpn || ""),
    canonicalManufacturer(id.manufacturerName || id.manufacturerId) || "ANY",
    norm(id.packageVariantId || id.packageCode || "ANY"),
  ];
  return parts.join(":").toLowerCase();
}

/**
 * 资源身份守卫：展示前校验资源确实属于该器件
 * @returns { ok:true } | { ok:false, code:'RESOURCE_IDENTITY_MISMATCH', reason }
 */
function guardResource(identity, resource, opts = {}) {
  if (!identity || !resource) return { ok: true };
  const idMpn = norm(identity.exactMpn || identity.requestedMpn);
  const idBase = norm(identity.baseDevice);

  // 1) 型号一致性：资源自称的型号需与身份同基础器件
  const resMpn = norm(resource.partNumber || resource.mpn || "");
  if (resMpn && idMpn && resMpn !== idMpn) {
    const resBase = norm(splitMpn(resource.partNumber || resource.mpn).baseDevice);
    if (resBase !== idBase)
      return { ok: false, code: "RESOURCE_IDENTITY_MISMATCH",
        reason: `资源型号 ${resource.partNumber} 与当前器件 ${identity.exactMpn || identity.requestedMpn} 不属于同一基础器件` };
  }

  // 2) 厂商一致性
  const idMfr = canonicalManufacturer(identity.manufacturerName);
  const resMfr = canonicalManufacturer(resource.manufacturer);
  if (idMfr && resMfr && idMfr !== resMfr)
    return { ok: false, code: "RESOURCE_IDENTITY_MISMATCH",
      reason: `资源厂商 ${resource.manufacturer} 与当前器件厂商 ${identity.manufacturerName} 不一致` };

  // 3) 文件名一致性（LM358ADR 详情里出现 LM2904BAIPWR.pdf 就是靠这条拦住）
  const fname = resource.fname || resource.fileName || fileNameOf(resource.url);
  if (fname && opts.checkFileName !== false) {
    const stem = norm(String(fname).replace(/\.[a-z0-9]+$/i, ""));
    if (stem && idBase && stem.length >= 4 && !stem.includes(idBase) && !idBase.includes(stem.slice(0, 6))) {
      return { ok: false, code: "RESOURCE_IDENTITY_MISMATCH",
        reason: `资源文件名 ${fname} 与器件 ${identity.baseDevice} 不匹配` };
    }
  }
  return { ok: true };
}

function fileNameOf(url) {
  if (!url) return "";
  try { return new URL(url).pathname.split("/").pop() || ""; } catch { return ""; }
}

/** 厂商规范化：解决 "Texas Instruments" / "texas instruments" / "TI" 重复 */
const MFR_ALIASES = [
  [/texas\s*instruments|^ti$|ti\s*inc/i, "TEXAS_INSTRUMENTS"],
  [/analog\s*devices|^adi$|linear\s*technology|^ltc$/i, "ANALOG_DEVICES"],
  [/stmicro|^st$|sgs.?thomson/i, "STMICROELECTRONICS"],
  [/microchip|^atmel$/i, "MICROCHIP"],
  [/nxp|freescale|philips\s*semi/i, "NXP"],
  [/infineon|international\s*rectifier|^ir$|cypress/i, "INFINEON"],
  [/on\s*semi|onsemi|fairchild/i, "ONSEMI"],
  [/maxim|^max$/i, "MAXIM"],
  [/renesas|intersil|idt/i, "RENESAS"],
  [/rohm/i, "ROHM"], [/nexperia/i, "NEXPERIA"], [/diodes\s*inc/i, "DIODES"],
  [/兆易创新|gigadevice/i, "GIGADEVICE"], [/沁恒|^wch$/i, "WCH"],
  [/圣邦微|sgmicro/i, "SGMICRO"], [/思瑞浦|3peak/i, "3PEAK"],
  [/极海|geehy/i, "GEEHY"], [/国民技术|nations/i, "NATIONSTECH"],
  [/矽力杰|silergy/i, "SILERGY"], [/纳芯微|novosense/i, "NOVOSENSE"],
];
function canonicalManufacturer(name) {
  const s = String(name || "").trim();
  if (!s) return null;
  for (const [re, id] of MFR_ALIASES) if (re.test(s)) return id;
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24) || null;
}

/** 厂商列表去重（大小写/别名归一） */
function dedupeManufacturers(list = []) {
  const seen = new Map();
  for (const m of list) {
    const key = canonicalManufacturer(m);
    if (key && !seen.has(key)) seen.set(key, String(m).trim());
  }
  return [...seen.values()];
}

module.exports = {
  splitMpn, resolveIdentity, identityCacheKey, guardResource,
  canonicalManufacturer, dedupeManufacturers, ORDERABLE_SUFFIX,
};
