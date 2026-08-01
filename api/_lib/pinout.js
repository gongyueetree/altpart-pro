// pinout.js — AI 引脚定义查询（eCAD 级联的最后一档）
//
// 使用前提：ezPLM / KiCad 官方库 / PDF 数据手册都拿不到引脚定义时才调用。
// 分工原则：AI 只提供语义（引脚叫什么、是什么类型），
//          引脚位置与图形排布由程序按 KiCad 惯例布局，不交给 AI。
// 结果必须标注为 AI 生成且未经验证。

const { callGemini, repairJSON } = require("./gemini");
const { cache } = require("./cache");
const TTL = 7 * 86400;

const TYPES = ["input", "output", "bidirectional", "power", "passive", "no_connect"];

/**
 * 查询引脚定义
 * @param {string} partNumber 型号
 * @param {number} pinCount   期望引脚数（来自封装），用于校验
 * @param {string} pkg        封装名，帮助模型定位具体订货变体
 */
async function getAiPinout(partNumber, pinCount, pkg) {
  if (!partNumber) return null;
  const ck = `pinout:${partNumber.toLowerCase()}:${pinCount || 0}`;
  const hit = cache.get(ck);
  if (hit !== null && hit !== undefined) return hit || null;

  const sys = `你是元器件引脚定义查询工具，回答型号 "${partNumber}" 的引脚定义。
${pkg ? `封装：${pkg}` : ""}${pinCount ? `，共 ${pinCount} 个引脚` : ""}。

⚠ 必须是 "${partNumber}" **本身**的引脚定义，严禁套用同系列其它型号或相似型号的引脚。
⚠ 不确定就返回 {"pins":[],"reason":"不确定"}，宁可为空也不要编造。
⚠ **严禁用 "NC" 填充你不确定的引脚**。NC 表示"厂商明确标注为不连接"，
   不是"我不知道"。只有 datasheet 确实标 NC 的引脚才可填 NC；
   若多数引脚你都不确定，整体返回空数组，不要逐个填 NC 凑数。
⚠ 引脚名用 datasheet 中的正式缩写（如 VCC / GND / OUT / IN+ / EP），不要用中文或自造名。
⚠ 反例警示：曾有模型把 AD8331(20-QSOP，真实引脚为 LMD/INH/VPSL/LON/LOP/COML/VIP/VIN/
   MODE/GAIN/VCM/RCLMP/HILO/VPOS/VOH/VOL/COMM/ENBV/ENBL) 编造成
   INL+/INL-/VNEG/VREF/OUT 加一堆 NC。若你对该型号的引脚没有确切记忆，直接返回空数组。

type 取值：input / output / bidirectional / power / passive / no_connect
只返回 JSON：
{"pins":[{"number":"1","name":"引脚名","type":"类型","description":"10字内说明"}],
 "confidence":"high|medium|low"}
${pinCount ? `pins 数组应有 ${pinCount} 项，编号 1..${pinCount}（含 EP 等特殊引脚时可略多）。` : ""}`;

  let raw;
  try {
    raw = await callGemini(sys, `查询 ${partNumber} 的引脚定义`, 4096, false);
  } catch (e) {
    console.warn("[pinout] AI 调用失败:", e.message);
    cache.set(ck, false, 3600);
    return null;
  }

  let data;
  try { data = repairJSON(raw); } catch (e) { cache.set(ck, false, 3600); return null; }

  const pins = (data?.pins || [])
    .map(p => ({
      number: String(p?.number ?? "").trim(),
      name: String(p?.name ?? "").trim(),
      type: TYPES.includes(String(p?.type)) ? String(p.type) : "passive",
      description: String(p?.description ?? "").slice(0, 60),
    }))
    .filter(p => p.number && p.name && !/^n\/?a$/i.test(p.name));

  if (pins.length < 2) { cache.set(ck, false, 3600); return null; }

  // NC 占比过高说明模型在用 NC 填充未知引脚（NC 是明确声明，不是"不知道"）
  const ncCount = pins.filter(p => /^n\.?c\.?$|^nc\d*$|no[_ ]?connect/i.test(p.name)).length;
  const ncRatio = ncCount / pins.length;
  if (ncRatio > 0.4) {
    console.warn(`[pinout] ${partNumber}: NC 占比 ${(ncRatio * 100).toFixed(0)}%（${ncCount}/${pins.length}），判定为填充式作答，拒绝采用`);
    cache.set(ck, false, 3600);
    return null;
  }
  // 同名非电源引脚大量重复也是填充特征
  const nameCount = {};
  for (const p of pins) {
    if (/^(gnd|vss|vcc|vdd|vee|v\+|v-|nc|ep|agnd|dgnd)$/i.test(p.name)) continue;
    nameCount[p.name.toUpperCase()] = (nameCount[p.name.toUpperCase()] || 0) + 1;
  }
  if (Object.values(nameCount).some(c => c >= 4)) {
    console.warn(`[pinout] ${partNumber}: 存在大量同名信号引脚，判定为填充式作答，拒绝采用`);
    cache.set(ck, false, 3600);
    return null;
  }

  // 引脚数与封装标称不符时如实告警，不静默采用
  let warning = "";
  if (pinCount && pins.length !== pinCount) {
    // 引脚数都对不上，名称更不可信 → 直接拒绝
    console.warn(`[pinout] ${partNumber}: AI 返回 ${pins.length} 个引脚，封装标称 ${pinCount} 个，拒绝采用`);
    cache.set(ck, false, 3600);
    return null;
  }
  if (ncCount > 0) {
    warning = (warning ? warning + "；" : "") + `含 ${ncCount} 个 NC 引脚，请与 datasheet 核对是否确为空脚`;
  }
  const result = {
    pins,
    confidence: ["high", "medium", "low"].includes(data?.confidence) ? data.confidence : "low",
    warning,
    source: "ai_pinout",
    note: "引脚名由 AI 提供，未经 datasheet 核对",
  };
  cache.set(ck, result, TTL);
  return result;
}

module.exports = { getAiPinout };
