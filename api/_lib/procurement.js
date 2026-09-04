// procurement.js — 采购条件的唯一数据契约。

const REGIONS = new Set(["CN", "HK", "US", "EU"]);
const CURRENCIES = new Set(["USD", "CNY", "EUR"]);
const PACKAGING = new Set(["any", "tape", "tube", "tray", "cut"]);

function normalizeProcurement(raw = {}) {
  const region = String(raw.region || "US").trim().toUpperCase();
  const currency = String(raw.currency || "USD").trim().toUpperCase();
  const packaging = String(raw.packaging || "any").trim().toLowerCase();
  const quantity = Number(raw.quantity == null ? 100 : raw.quantity);

  if (!REGIONS.has(region)) throw new Error(`不支持的采购地区：${region}`);
  if (!CURRENCIES.has(currency)) throw new Error(`不支持的币种：${currency}`);
  if (!PACKAGING.has(packaging)) throw new Error(`不支持的包装方式：${packaging}`);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000)
    throw new Error("采购数量必须是 1~1000000 的整数");

  return { region, currency, packaging, quantity, inStockOnly: raw.inStockOnly === true };
}

function procurementCacheKey(raw) {
  const p = normalizeProcurement(raw);
  return `${p.region}:${p.currency}:${p.packaging}:${p.quantity}:${p.inStockOnly ? 1 : 0}`;
}

module.exports = { normalizeProcurement, procurementCacheKey, REGIONS, CURRENCIES, PACKAGING };
