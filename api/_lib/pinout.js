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
⚠ 引脚名用 datasheet 中的正式缩写（如 VCC / GND / OUT / IN+ / NC / EP），不要用中文或自造名。

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

  // 引脚数与封装标称不符时如实告警，不静默采用
  let warning = "";
  if (pinCount && Math.abs(pins.length - pinCount) > 1) {
    warning = `AI 返回 ${pins.length} 个引脚，与封装标称 ${pinCount} 个不符`;
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
