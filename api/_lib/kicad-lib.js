// kicad-lib.js — KiCad 官方库查询（gitlab.com/kicad/libraries）
//
// eCAD 优先级：ezPLM → KiCad 官方库 → PDF 数据手册生成
// 关键前提：ezPLM 的封装名本身遵循 KLC 命名（如 SSOP-20_3.9x8.7mm_P0.635mm），
// 因此封装/3D 可直接拼路径命中；符号需按品类猜测所属库文件再匹配符号名。
// 规范参考：https://klc.kicad.org/

const { cache } = require("./cache");
const RAW = "https://gitlab.com/kicad/libraries";
const TTL = 30 * 86400;   // 官方库变动少，缓存 30 天

const symUrl = lib => `${RAW}/kicad-symbols/-/raw/master/${lib}.kicad_sym`;
const fpUrl = (dir, name) => `${RAW}/kicad-footprints/-/raw/master/${dir}.pretty/${name}.kicad_mod`;
const modelUrl = (dir, name) => `${RAW}/kicad-packages3D/-/raw/master/${dir}.3dshapes/${name}.step`;

/* ── 封装名 → .pretty 目录（KLC 分类惯例）── */
const FP_DIRS = [
  [/^(SOIC|SO|SOP|SSOP|TSSOP|VSSOP|MSOP|HTSSOP|TSOP)[-_]/i, "Package_SO"],
  [/^(SOT|TSOT|SC-?7\d|SOT-?23|SOT-?223|SOT-?89)/i, "Package_TO_SOT_SMD"],
  [/^(TO-?\d+|TO-?92|TO-?220|TO-?247)/i, "Package_TO_SOT_THT"],
  [/^(QFN|WQFN|UQFN|VQFN|DFN|UDFN|WDFN|SON)[-_]/i, "Package_DFN_QFN"],
  [/^(LQFP|TQFP|QFP|PQFP|HTQFP)[-_]/i, "Package_QFP"],
  [/^(BGA|FBGA|LFBGA|TFBGA|VFBGA|UFBGA|WLCSP)[-_]/i, "Package_BGA"],
  [/^(DIP|PDIP|CDIP|SDIP)[-_]/i, "Package_DIP"],
  [/^(R|C|L|D|LED|F|FB)_\d{4}/i, null],           // 无源件按类型细分，见下
  [/^SIP|^SIL/i, "Package_SIP"],
  [/^(LGA|CSP)[-_]/i, "Package_LGA"],
];
const PASSIVE_DIRS = [
  [/^R_\d{4}/i, "Resistor_SMD"], [/^R_Axial/i, "Resistor_THT"],
  [/^C_\d{4}/i, "Capacitor_SMD"], [/^CP_/i, "Capacitor_SMD"], [/^C_Disc|^C_Rect/i, "Capacitor_THT"],
  [/^L_\d{4}|^L_[A-Z]/i, "Inductor_SMD"],
  [/^D_\d{4}|^D_SOD/i, "Diode_SMD"], [/^D_DO-/i, "Diode_THT"],
  [/^LED_\d{4}/i, "LED_SMD"], [/^LED_D/i, "LED_THT"],
  [/^Crystal/i, "Crystal"], [/^F_/i, "Fuse"],
];

function footprintDir(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  for (const [re, dir] of PASSIVE_DIRS) if (re.test(n)) return dir;
  for (const [re, dir] of FP_DIRS) if (dir && re.test(n)) return dir;
  return null;
}

/* ── 品类 → 符号库文件（按需扩充）── */
const SYM_LIBS = {
  R: ["Device"], C: ["Device"], CP: ["Device"], L: ["Device"], D: ["Device"],
  DZ: ["Device"], DS: ["Device"], LED: ["Device"], XTAL: ["Device"], F: ["Device"],
  NMOS: ["Transistor_FET"], PMOS: ["Transistor_FET"],
  NPN: ["Transistor_BJT"], PNP: ["Transistor_BJT"],
  opamp: ["Amplifier_Operational"], vga: ["Amplifier_Operational", "Amplifier_Video"],
  inamp: ["Amplifier_Instrumentation"],
  comparator: ["Comparator"], vref: ["Reference_Voltage"],
  ldo: ["Regulator_Linear"], dcdc: ["Regulator_Switching"],
  adc: ["Analog_ADC"], dac: ["Analog_DAC"],
  demod: ["RF", "RF_Mixer"], rfamp: ["RF_Amplifier"],
  logic: ["74xx", "4xxx"], interface: ["Interface_UART", "Interface_USB", "Interface_CAN_LIN"],
  memory: ["Memory_EEPROM", "Memory_Flash"], sensor: ["Sensor", "Sensor_Temperature"],
};
/** MCU 按厂商系列推断库文件（官方库按系列拆分得很细） */
function mcuLibs(mpn) {
  const s = String(mpn || "").toUpperCase();
  const m = s.match(/^STM32([FGHLUWC]\d)/);
  if (m) return [`MCU_ST_STM32${m[1]}`];
  if (/^(ATMEGA|ATTINY)/.test(s)) return ["MCU_Microchip_ATmega", "MCU_Microchip_ATtiny"];
  if (/^(PIC\d|DSPIC)/.test(s)) return ["MCU_Microchip_PIC16", "MCU_Microchip_PIC18"];
  if (/^ESP32/.test(s)) return ["RF_Module"];
  if (/^GD32/.test(s)) return ["MCU_GigaDevice_GD32F1"];
  if (/^NRF5/.test(s)) return ["RF_Module"];
  return ["MCU_ST_STM32F1"];
}

async function fetchText(url, ttl = TTL) {
  const ck = `kl:${url}`;
  const hit = cache.get(ck);
  if (hit !== null && hit !== undefined) return hit || null;
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) { cache.set(ck, false, 3600); return null; }
    const t = await r.text();
    if (!t || t.length < 20) { cache.set(ck, false, 3600); return null; }
    cache.set(ck, t, ttl);
    return t;
  } catch (e) { console.warn("[kicad-lib]", url.slice(-60), e.message); return null; }
}

/** 从库文件中抽出单个符号（含其所有子单元），组成最小 kicad_symbol_lib */
function extractSymbol(libText, wantName) {
  const want = String(wantName || "").toUpperCase();
  if (!want) return null;
  const re = /\(symbol\s+"([^"]+)"/g;
  let m, best = null;
  const cands = [];
  while ((m = re.exec(libText))) {
    const name = m[1];
    // 跳过子单元（形如 NAME_1_1）
    if (/_\d+_\d+$/.test(name)) continue;
    cands.push({ name, idx: m.index });
  }
  const norm = x => String(x).toUpperCase().replace(/[^A-Z0-9]/g, "");
  best = cands.find(c => c.name.toUpperCase() === want)
      || cands.find(c => norm(c.name) === norm(want))
      || cands.find(c => norm(want).startsWith(norm(c.name)) && norm(c.name).length >= 4);
  if (!best) return null;
  // 括号配平截取该 symbol 块
  let depth = 0, end = -1;
  for (let i = best.idx; i < libText.length; i++) {
    const c = libText[i];
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return null;
  return { name: best.name, text: `(kicad_symbol_lib (version 20211014) (generator kicad)\n${libText.slice(best.idx, end)}\n)` };
}

/** 官方库查符号：按品类/型号猜库文件，命中即返回 */
async function findSymbol({ partNumber, kind, mpnBase }) {
  const libs = /^mcu$/i.test(kind || "") ? mcuLibs(partNumber) : (SYM_LIBS[kind] || []);
  for (const lib of libs) {
    const text = await fetchText(symUrl(lib));
    if (!text) continue;
    for (const name of [mpnBase, partNumber].filter(Boolean)) {
      const got = extractSymbol(text, name);
      if (got) return { ...got, lib, url: symUrl(lib), source: "kicad_official" };
    }
  }
  return null;
}

/** 官方库查封装：ezPLM 封装名多与 KLC 一致，可直接拼路径 */
async function findFootprint(footprintName) {
  const name = String(footprintName || "").trim();
  if (!name) return null;
  const dir = footprintDir(name);
  if (!dir) return null;
  const url = fpUrl(dir, name);
  const text = await fetchText(url);
  if (!text || !text.includes("(pad")) return null;
  return { name, dir, url, text, source: "kicad_official" };
}

/** 官方库查 3D 模型（STEP） */
async function findModel3D(footprintName) {
  const name = String(footprintName || "").trim();
  const dir = footprintDir(name);
  if (!dir) return null;
  const url = modelUrl(dir, name);
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return { name, dir, url, source: "kicad_official" };
  } catch (e) { return null; }
}

module.exports = { findSymbol, findFootprint, findModel3D, footprintDir, extractSymbol };
