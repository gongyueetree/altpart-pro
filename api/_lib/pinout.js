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
/** EP / 散热焊盘 / 外壳等不占常规编号的附加引脚 */
const EP_RE = /^(ep|e\.?p\.?|pad|thermal[_ ]?pad|exposed[_ ]?pad|tab|case|shield|substrate|die[_ ]?pad|dap)\d*$/i;
const isEpPin = p => EP_RE.test(p.name) || EP_RE.test(p.number);

/** 拒绝原因常量 —— 前端据此给出可操作提示，而不是笼统一句"未能给出" */
const REJECT = {
  CALL_FAILED:  { code: "ai_call_failed",  message: "AI 服务调用失败或超时" },
  BAD_JSON:     { code: "ai_bad_json",     message: "AI 返回内容无法解析为引脚表" },
  EMPTY:        { code: "ai_declined",     message: "AI 对该型号的引脚定义没有把握，按约定返回空（宁缺勿造）" },
  NC_FILLED:    { code: "ai_nc_filled",    message: "AI 用大量 NC 填充未知引脚，判定为凑数作答，已拒绝采用" },
  DUP_NAMES:    { code: "ai_dup_names",    message: "AI 返回大量同名信号引脚，判定为凑数作答，已拒绝采用" },
  COUNT_MISMATCH: { code: "ai_count_mismatch", message: "AI 返回的引脚数与封装标称不符，引脚名不可信，已拒绝采用" },
};

async function getAiPinout(partNumber, pinCount, pkg) {
  if (!partNumber) return null;
  const ck = `pinout:${partNumber.toLowerCase()}:${pinCount || 0}`;
  const hit = cache.get(ck);
  if (hit !== null && hit !== undefined) return hit || null;

  const sys = `你是元器件引脚定义查询工具，回答型号 "${partNumber}" 的引脚定义。
${pkg ? `封装：${pkg}` : ""}${pinCount ? `，共 ${pinCount} 个引脚` : ""}。

请先联网检索该型号的官方 datasheet（优先厂商官网 PDF），从其中的
Pin Configuration / Pin Functions / Terminal Functions 表读取引脚定义再作答。

⚠ 必须是 "${partNumber}" **本身**的引脚定义，严禁套用同系列其它型号或相似型号的引脚。
⚠ 检索不到或不确定就返回 {"pins":[],"reason":"不确定"}，宁可为空也不要编造。
⚠ **严禁用 "NC" 填充你不确定的引脚**。NC 表示"厂商明确标注为不连接"，
   不是"我不知道"。只有 datasheet 确实标 NC 的引脚才可填 NC；
   若多数引脚你都不确定，整体返回空数组，不要逐个填 NC 凑数。
⚠ 引脚名用 datasheet 中的正式缩写（如 VCC / GND / OUT / IN+ / EP），不要用中文或自造名。
⚠ 反例警示：曾有模型把 AD8331(20-QSOP，真实引脚为 LMD/INH/VPSL/LON/LOP/COML/VIP/VIN/
   MODE/GAIN/VCM/RCLMP/HILO/VPOS/VOH/VOL/COMM/ENBV/ENBL) 编造成
   INL+/INL-/VNEG/VREF/OUT 加一堆 NC。若你对该型号的引脚没有确切记忆，直接返回空数组。

type 取值：input / output / bidirectional / power / passive / no_connect
只返回 JSON，不要 markdown 代码块、不要任何解释文字：
{"pins":[{"number":"1","name":"引脚名","type":"类型","description":"10字内说明"}],
 "confidence":"high|medium|low"}
${pinCount ? `编号引脚必须恰好 ${pinCount} 项，编号 1..${pinCount}。
若该封装另有散热焊盘，额外追加一项，name 用 "EP"，number 用 "EP" 或 ${pinCount + 1}。` : ""}`;

  // 负缓存 600s：AI 输出有随机性，被拒后长缓存会让"重试"按钮在 1 小时内形同虚设
  const reject = r => { cache.set(ck, false, 600); return { pins: [], rejected: r }; };

  // 两段式调用。
  // 第一段（联网检索）：引脚名是强事实性内容，先检索 datasheet 原文最能压幻觉。
  //   但 useSearch=true 时 callGemini 不关 thinking（2.5-flash 是思考模型），
  //   4096 预算会被思考+检索引用吃光导致**空响应** —— v6.9.2 切到联网后
  //   线上一律"按约定返回空"正是这个原因。预算提到 8192。
  // 第二段（模型记忆兜底）：第一段空/解析失败时退回 JSON 模式（关 thinking），
  //   常见型号靠记忆仍能给出引脚名；反幻觉的统计拦截对两段同样生效。
  let raw = null, stage = "grounded";
  try {
    raw = await callGemini(sys, `查询 ${partNumber} 的引脚定义`, 8192, true);
  } catch (e) { console.warn("[pinout] 联网检索失败:", e.message); }
  let data = null;
  if (raw) { try { data = repairJSON(raw); } catch { /* 落入兜底 */ } }
  if (!data?.pins?.length) {
    stage = "memory";
    try {
      raw = await callGemini(sys, `查询 ${partNumber} 的引脚定义`, 4096, false);
    } catch (e) {
      console.warn("[pinout] AI 调用失败:", e.message);
      return reject({ ...REJECT.CALL_FAILED, detail: e.message });
    }
    try { data = repairJSON(raw); } catch { return reject(REJECT.BAD_JSON); }
  }

  const seen = new Set();
  const pins = (data?.pins || [])
    .map(p => ({
      number: String(p?.number ?? "").trim(),
      name: String(p?.name ?? "").trim(),
      type: TYPES.includes(String(p?.type)) ? String(p.type) : "passive",
      description: String(p?.description ?? "").slice(0, 60),
    }))
    .filter(p => p.number && p.name && !/^n\/?a$/i.test(p.name))
    // 同一编号重复出现只保留首个，避免布局时同位置叠加两个引脚
    .filter(p => { const k = p.number.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true; });

  if (pins.length < 2) return reject(REJECT.EMPTY);

  // NC 占比过高说明模型在用 NC 填充未知引脚（NC 是明确声明，不是"不知道"）
  const ncCount = pins.filter(p => /^n\.?c\.?$|^nc\d*$|no[_ ]?connect/i.test(p.name)).length;
  if (ncCount / pins.length > 0.4) {
    console.warn(`[pinout] ${partNumber}: NC 占比 ${ncCount}/${pins.length}，判定为填充式作答`);
    return reject({ ...REJECT.NC_FILLED, detail: `${ncCount}/${pins.length} 为 NC` });
  }
  // 同名非电源引脚大量重复也是填充特征
  const nameCount = {};
  for (const p of pins) {
    if (/^(gnd|vss|vcc|vdd|vee|v\+|v-|nc|ep|agnd|dgnd)$/i.test(p.name)) continue;
    nameCount[p.name.toUpperCase()] = (nameCount[p.name.toUpperCase()] || 0) + 1;
  }
  if (Object.values(nameCount).some(c => c >= 4)) {
    console.warn(`[pinout] ${partNumber}: 存在大量同名信号引脚，判定为填充式作答`);
    return reject(REJECT.DUP_NAMES);
  }

  // 引脚数校验 —— 以**编号覆盖**为准，不以名字为准。
  // v6.9.2 的规则只看名字：AI 把编号在 1..pinCount 内的某脚命名为 "EP" 时，
  // 该脚被踢出计数 → 19≠20 → 整份误拒（线上 AD8331ARQZ 正是如此）。
  // 正确语义：编号落在封装范围内的脚，无论叫什么，都占一个编号位、必须计数；
  // 只有编号超出范围或编号本身是 "EP"/"PAD" 的附加焊盘才不占位。
  const numbered = [], epExtras = [], strays = [];
  for (const p of pins) {
    const n = parseInt(p.number, 10);
    if (Number.isInteger(n) && n >= 1 && (!pinCount || n <= pinCount)) numbered.push({ ...p, _n: n });
    else if (isEpPin(p)) epExtras.push(p);
    else strays.push(p);
  }
  if (pinCount) {
    // 去重已保证编号唯一，size 即覆盖数；比"总数相等"更严：1..pinCount 必须齐全
    const covered = new Set(numbered.map(p => p._n)).size;
    if (covered !== pinCount) {
      console.warn(`[pinout] ${partNumber}: 编号覆盖 ${covered}/${pinCount}（另有 ${epExtras.length} 个附加焊盘、${strays.length} 个异常编号），拒绝采用`);
      return reject({ ...REJECT.COUNT_MISMATCH, detail: `编号引脚覆盖 ${covered}/${pinCount}` });
    }
  }
  // 编号内被命名为 EP 的脚（如 QFN 的 pad 常记作第 N+1 脚以外的形态）计入提示
  const epNamed = numbered.filter(isEpPin);

  let warning = "";
  if (ncCount > 0) warning = `含 ${ncCount} 个 NC 引脚，请与 datasheet 核对是否确为空脚`;
  if (epExtras.length + epNamed.length) warning = (warning ? warning + "；" : "") + `含 ${epExtras.length + epNamed.length} 个散热焊盘(EP)，需确认是否接地`;
  if (strays.length) warning = (warning ? warning + "；" : "") + `含 ${strays.length} 个编号异常引脚（已保留，请核对）`;

  const result = {
    pins,
    confidence: ["high", "medium", "low"].includes(data?.confidence) ? data.confidence : "low",
    warning,
    source: "ai_pinout",
    stage,   // grounded=经联网检索 / memory=模型记忆兜底，前端据此提示可信度
    note: stage === "grounded"
      ? "引脚名由 AI 联网检索 datasheet 后提供，仍需人工核对"
      : "引脚名来自 AI 模型记忆（联网检索未获结果），可信度较低，务必核对 datasheet",
  };
  cache.set(ck, result, TTL);
  return result;
}

module.exports = { getAiPinout, isEpPin, REJECT };
