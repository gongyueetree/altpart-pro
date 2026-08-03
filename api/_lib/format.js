// format.js — 参数值统一格式化
//
// ALT-007：页面出现 "64 KB KB"、"2.0 - 3.6 V V"、"72 MHz MHz"、
// "Sleep, Stop, Standby/2 µA µA" —— 值里已含单位，组件又拼了一次。
// 规则：由本模块统一负责展示，组件禁止自行拼接单位。

const NA_RE = /^(n\/?a|na|—|-|--|tbd|unknown|未知|无)$/i;

/**
 * ezPLM 用 "||" 作多值分隔符，直接展示会出现 "105||85"、"Dual Watchdog||RTC||SysTick"。
 * 数值型多值（如温度等级 105/85）用 " / " 连接；文本型用 "、" 连接。
 */
function normalizeMultiValue(v) {
  const raw = String(v ?? "");
  if (!raw.includes("||")) return raw;
  const parts = raw.split("||").map(x => x.trim()).filter(Boolean);
  if (!parts.length) return raw;
  const allNumeric = parts.every(x => /^[-+±]?[\d.]+\s*[a-zA-ZΩ°µμ%]*$/.test(x));
  return parts.join(allNumeric ? " / " : "、");
}

/**
 * 判断值字符串末尾是否已带该单位
 * "64 KB" + unit "KB" → true；"2.0 - 3.6 V" + "V" → true
 */
function alreadyHasUnit(value, unit) {
  if (!unit) return true;
  const v = String(value).trim();
  const u = String(unit).trim();
  if (!v || !u) return true;
  const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 末尾单位，或单位后跟括号说明（如 "70°C（TA）"）
  return new RegExp(`${esc}\\s*(\\([^)]*\\)|（[^）]*）)?$`, "i").test(v)
      || new RegExp(`\\d\\s*${esc}\\b`, "i").test(v);
}

/**
 * 格式化参数值用于展示
 * @returns { text, isNA, unitApplied }
 */
function formatValue(value, unit, opts = {}) {
  if (value === undefined || value === null) return { text: "N/A", isNA: true, unitApplied: false };
  const v = normalizeMultiValue(String(value).trim()).trim();
  if (!v || NA_RE.test(v)) return { text: "N/A", isNA: true, unitApplied: false };
  if (!unit) return { text: v, isNA: false, unitApplied: false };
  if (alreadyHasUnit(v, unit)) return { text: v, isNA: false, unitApplied: false };
  // 只有"以数值开头"的值才应加单位。
  // 仅凭"含数字"判断会把 ARM Cortex-M3 加成 "ARM Cortex-M3 MHz"。
  if (!/^[-+±]?[\d.]/.test(v)) return { text: v, isNA: false, unitApplied: false };
  return { text: `${v} ${unit}`, isNA: false, unitApplied: true };
}

/** 供导出使用：值与单位分列 */
function splitValueUnit(value, unit) {
  const f = formatValue(value, unit);
  if (f.isNA) return { value: "N/A", unit: "" };
  if (f.unitApplied) return { value: String(value).trim(), unit: unit || "" };
  // 值里已含单位 → 尝试拆出来
  const u = String(unit || "").trim();
  if (u) {
    const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = String(value).trim().match(new RegExp(`^(.*?)\\s*${esc}\\s*$`, "i"));
    if (m) return { value: m[1].trim(), unit: u };
  }
  return { value: String(value).trim(), unit: "" };
}

module.exports = { formatValue, splitValueUnit, alreadyHasUnit, normalizeMultiValue };
