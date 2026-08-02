// category-params.js — 品类代表性参数模板
//
// 线上问题：AD8331(VGA) 的参数列表是
//   类型 / 应用 / 封装 / Type / Applications / Package Case / Supplier Device Package
// 七项里四项是同一参数的中英重复，且没有一个真正的技术指标；
// 而 ezPLM 明明有 供电电压 5V、噪声 0.74nV/√Hz、增益 −4.5~+43.5dB、功耗 125mW、−3dB带宽 120MHz。
//
// 替代料比对的价值全在这些品类特征参数上，因此必须：
//   1. 按品类定义"代表性参数"及其重要度顺序
//   2. 合并多来源时按语义去重（类型≡Type，封装≡Package/Case≡Supplier Device Package）
//   3. 优先把模板参数排到前面，通用字段（应用/包装/库存类）靠后

const { sameParam } = require("./param-align");

/** 参数名 → 默认单位（AI/分销商常丢单位，导致 "输入偏置电流 150000" 这种无法解读的值） */
const DEFAULT_UNITS = [
  [/增益带宽积|gbw/i, "MHz"], [/带宽|bandwidth/i, "MHz"],
  [/压摆率|slew/i, "V/µs"], [/主频|frequency/i, "MHz"], [/开关频率|switching/i, "kHz"],
  [/输入失调电压|offset\s*voltage|vos/i, "mV"], [/输入偏置电流|bias\s*current|ib/i, "nA"],
  [/等效输入噪声|噪声密度|noise\s*density/i, "nV/√Hz"], [/噪声系数|noise\s*figure/i, "dB"],
  [/静态电流|quiescent|iq/i, "µA"], [/供电电压|电源电压|supply\s*voltage/i, "V"],
  [/输出电流|output\s*current/i, "mA"], [/工作温度|temperature/i, "°C"],
  [/功耗|power/i, "mW"], [/导通电阻|rds/i, "mΩ"], [/栅电荷|qg/i, "nC"],
  [/增益|gain/i, "dB"], [/cmrr|psrr|snr/i, "dB"], [/效率|efficiency/i, "%"],
  [/压差|dropout/i, "mV"], [/采样率|sample\s*rate/i, "kSPS"],
];

/** 值本身不含单位时，按参数名补默认单位（并标记为推断） */
function inferUnit(param) {
  if (param.unit) return param;
  const v = String(param.value ?? "").trim();
  if (!v || /^n\/?a$/i.test(v)) return param;
  if (/[a-zA-ZΩ°µμ%√]/.test(v.replace(/^[\d.,\s+\-~到至]+/, ""))) return param;  // 值里已有单位
  if (!/^[-+]?[\d.]/.test(v)) return param;                                        // 非数值
  for (const [re, u] of DEFAULT_UNITS)
    if (re.test(`${param.name || ""} ${param.nameEn || ""}`))
      return { ...param, unit: u, unitInferred: true };
  return param;
}

/**
 * 每个品类的代表性参数，按重要度排序。
 * 名称写常见中文；实际匹配走 param-align 的同义词表，中英与限定词形态都能命中。
 */
const CATEGORY_TEMPLATES = {
  vga: { label: "可变增益放大器", params: [
    "增益", "带宽", "等效输入噪声", "噪声系数", "供电电压范围",
    "功耗", "压摆率", "通道数", "工作温度", "封装"] },
  opamp: { label: "运算放大器", params: [
    "增益带宽积", "压摆率", "输入失调电压", "输入偏置电流", "等效输入噪声",
    "供电电压范围", "静态电流", "CMRR", "通道数", "工作温度", "封装"] },
  inamp: { label: "仪表放大器", params: [
    "增益范围", "增益带宽积", "输入失调电压", "CMRR", "等效输入噪声",
    "供电电压范围", "静态电流", "工作温度", "封装"] },
  comparator: { label: "比较器", params: [
    "响应时间", "输入失调电压", "供电电压范围", "静态电流", "输出类型",
    "通道数", "工作温度", "封装"] },
  vref: { label: "电压基准", params: [
    "输出电压", "初始精度", "温漂", "输出电流", "静态电流",
    "输入电压范围", "噪声", "工作温度", "封装"] },
  ldo: { label: "LDO 稳压器", params: [
    "输出电压", "最大输出电流", "压差", "静态电流", "PSRR",
    "输入电压范围", "输出噪声", "工作温度", "封装"] },
  dcdc: { label: "DC-DC 转换器", params: [
    "拓扑", "输入电压范围", "输出电压", "最大输出电流", "开关频率",
    "效率", "静态电流", "工作温度", "封装"] },
  mcu: { label: "微控制器", params: [
    "内核", "主频", "Flash", "SRAM", "GPIO数量",
    "供电电压范围", "ADC", "通信接口", "工作温度", "封装"] },
  adc: { label: "ADC", params: [
    "分辨率", "采样率", "通道数", "SNR", "INL",
    "供电电压范围", "功耗", "接口", "工作温度", "封装"] },
  dac: { label: "DAC", params: [
    "分辨率", "采样率", "通道数", "INL", "建立时间",
    "供电电压范围", "功耗", "接口", "工作温度", "封装"] },
  mosfet: { label: "MOSFET", params: [
    "类型", "Vds(max)", "Id(max)", "导通电阻", "栅电荷",
    "Vgs(th)", "功耗", "工作温度", "封装"] },
  rfamp: { label: "射频放大器", params: [
    "频率范围", "增益", "噪声系数", "P1dB", "OIP3",
    "供电电压范围", "功耗", "工作温度", "封装"] },
  demod: { label: "解调器/混频器", params: [
    "频率范围", "转换增益", "噪声系数", "OIP3", "LO功率",
    "供电电压范围", "功耗", "工作温度", "封装"] },
  sensor: { label: "传感器", params: [
    "测量范围", "精度", "分辨率", "接口", "供电电压范围",
    "功耗", "响应时间", "工作温度", "封装"] },
};

/** 通用/低区分度字段：有值也不该占据前排 */
const GENERIC_LAST = /^(应用|applications?|包装|packaging|标准包装|standardpackqty|库存|stock|供应商|supplier|系列|series|状态|status|rohs|moisture|湿敏|生命周期|lifecycle|零件状态|partstatus|安装类型|mounting)/i;

/** 品类识别（与 detectSymbolKind 相互独立，这里针对参数模板） */
function detectCategory(text) {
  const t = String(text || "").toLowerCase();
  if (/可变增益|variable\s*gain|\bvga\b|压控增益|voltage\s*controlled\s*gain/.test(t)) return "vga";
  if (/仪表放大|instrumentation\s*amp/.test(t)) return "inamp";
  if (/运算放大|op-?amp|operational\s*amplifier/.test(t)) return "opamp";
  if (/比较器|comparator/.test(t)) return "comparator";
  if (/基准电压|voltage\s*reference|并联稳压|shunt\s*regulator/.test(t)) return "vref";
  if (/\bldo\b|线性稳压|linear\s*regulator/.test(t)) return "ldo";
  if (/dc-?dc|buck|boost|开关稳压|switching\s*regulator|降压|升压/.test(t)) return "dcdc";
  if (/微控制器|单片机|\bmcu\b|microcontroller/.test(t)) return "mcu";
  if (/模数转换|\badc\b|analog.to.digital/.test(t)) return "adc";
  if (/数模转换|\bdac\b|digital.to.analog/.test(t)) return "dac";
  if (/mosfet|场效应/.test(t)) return "mosfet";
  if (/解调|demodulator|混频|mixer/.test(t)) return "demod";
  if (/射频放大|rf\s*amplifier|\blna\b|低噪声放大/.test(t)) return "rfamp";
  if (/传感器|sensor/.test(t)) return "sensor";
  return null;
}

/**
 * 合并多来源参数并按品类重要度排序
 * @param params 合并后的原始参数数组（可能含中英重复）
 * @param categoryHint 品类文本（category + description）
 * @param topN 保留数量
 * @returns { params, category, template, dropped }
 */
function organizeParams(params, categoryHint, topN = 10) {
  const cat = detectCategory(categoryHint);
  const tpl = cat ? CATEGORY_TEMPLATES[cat] : null;

  // ── 1. 语义去重：同一参数只保留信息量最大的一条 ──
  const infoScore = p => {
    const v = String(p.value ?? "").trim();
    if (!v || /^n\/?a$/i.test(v)) return -1;
    let s = v.length;                                  // 值越具体越优先
    if (/^(ezplm|manual|datasheet)/.test(p.source || "")) s += 100;   // 权威来源优先
    else if (/^(digikey|mouser)/.test(p.source || "")) s += 50;
    if (/[\u4e00-\u9fa5]/.test(p.name || "")) s += 5;   // 同分时偏好中文名
    return s;
  };
  const kept = [];
  params = params.map(inferUnit);
  for (const p of params) {
    const dupIdx = kept.findIndex(k => sameParam(k.name, p.name) || sameParam(k.nameEn, p.name) || sameParam(k.name, p.nameEn));
    if (dupIdx < 0) { kept.push({ ...p }); continue; }
    if (infoScore(p) > infoScore(kept[dupIdx])) kept[dupIdx] = { ...p, id: kept[dupIdx].id };
  }

  // ── 2. 按品类模板排序 ──
  // 排序优先级：有值的模板参数 → 有值的其它参数 → 有值的通用字段 → 无值参数
  // （模板顺序不得压过"有没有值"：运放模板首项是增益带宽积，
  //   但它若为 N/A 就不该占据第一位，把有值的输入失调电压挤到后面）
  const rankOf = p => {
    const v = String(p.value ?? "").trim();
    const hasValue = v && !/^n\/?a$/i.test(v);
    const generic = GENERIC_LAST.test(String(p.name || "").replace(/\s/g, ""));
    const tplIdx = tpl ? tpl.params.findIndex(t => sameParam(t, p.name) || sameParam(t, p.nameEn)) : -1;

    if (!hasValue) return 900 + (tplIdx >= 0 ? tplIdx : 50);   // 无值一律靠后，内部仍按模板序
    if (generic) return 700 + (tplIdx >= 0 ? tplIdx : 50);      // 有值但通用字段
    if (tplIdx >= 0) return tplIdx;                              // 有值且在模板内
    return 500;                                                  // 有值、模板外
  };
  const sorted = kept.map((p, i) => ({ p, i, r: rankOf(p) }))
    .sort((a, b) => (a.r !== b.r ? a.r - b.r : a.i - b.i))
    .map(x => x.p);

  const head = sorted.slice(0, topN);
  return {
    params: head.map((p, i) => ({ ...p, id: p.id || `param_${i + 1}` })),
    dropped: sorted.slice(topN),
    category: cat,
    template: tpl ? { label: tpl.label, params: tpl.params } : null,
    // 模板里但当前没拿到值的参数，供上层决定是否补齐
    missingTemplateParams: tpl
      ? tpl.params.filter(t => !head.some(p => sameParam(t, p.name) || sameParam(t, p.nameEn)))
      : [],
  };
}

module.exports = { CATEGORY_TEMPLATES, detectCategory, organizeParams, inferUnit, DEFAULT_UNITS, GENERIC_LAST };
