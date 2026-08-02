// param-align.js — 参数名对齐
//
// 线上现象：候选明明来自 ezPLM，却大量显示 N/A、证据覆盖率仅 33%。
// 根因不是没数据，而是参数名对不上：
//   原型号「等效输入噪声」  vs  候选「输入噪声密度[典型值](nV/√Hz)」
//   原型号「工作温度」      vs  候选「工作温度[范围](°C)」
//   原型号「供电电压范围」  vs  候选「电源电压[最小值](V)」/「Supply Voltage」
// 朴素的 includes 匹配在这些形态下全部失效。

/** 去掉限定词、单位后缀、标点，得到可比较的名称核心 */
function normalizeName(name) {
  return String(name || "")
    .replace(/[（(][^)）]*[)）]\s*$/g, "")        // 去尾部括号单位 (V) (nV/√Hz)
    .replace(/\[[^\]]*\]/g, "")                    // 去 [典型值] [最大值] [范围]
    .replace(/[（(][^)）]*[)）]/g, "")             // 去中间括号
    .replace(/[\s_\-/·,，、:：]/g, "")
    .replace(/(典型值|最大值|最小值|范围|标称|额定|typ|max|min|nom|rated|range)/gi, "")
    .toLowerCase();
}

/** 同义词组：组内任意名称视为同一参数 */
const SYNONYMS = [
  ["等效输入噪声", "输入噪声密度", "输入参考噪声", "噪声密度", "前置放大器噪声", "前置放大器输入噪声", "电压噪声",
   "inputnoisedensity", "inputreferrednoise", "noisedensity", "envoltagenoise", "voltagenoise", "preampnoise"],
  ["工作温度", "工作温度范围", "operatingtemperature", "temperaturerange", "ambienttemperature", "工作环境温度"],
  ["供电电压范围", "工作电压", "电源电压", "supplyvoltage", "operatingvoltage", "supplyvoltagerange", "vs跨度", "vsspan"],
  ["输入失调电压", "失调电压", "inputoffsetvoltage", "offsetvoltage", "vos"],
  ["输入偏置电流", "偏置电流", "inputbiascurrent", "biascurrent", "ib"],
  ["静态电流", "电源电流", "quiescentcurrent", "supplycurrent", "iq"],
  ["增益带宽积", "gbw", "gainbandwidth", "gainbandwidthproduct"],
  ["带宽", "-3db带宽", "3db带宽", "小信号带宽", "bandwidth", "3dbbandwidth", "smallsignalbandwidth", "-3dbbandwidth"],
  ["压摆率", "slewrate", "sr"],
  ["通道数", "通道数量", "channels", "numberofchannels", "channelcount"],
  ["封装", "封装类型", "package", "packagecase", "footprint", "supplierdevicepackage"],
  ["参考价格", "价格", "price", "unitprice"],
  ["增益", "增益范围", "gain", "voltagegain", "gainrange", "最大增益范围", "增益调节范围"],
  ["输出电流", "最大输出电流", "outputcurrent", "maxoutputcurrent", "iout"],
  ["输入电压范围", "inputvoltagerange", "vin"],
  ["输出电压", "outputvoltage", "vout"],
  ["功耗", "静态功耗", "powerdissipation", "powerconsumption", "pd", "quiescentpower"],
  ["效率", "efficiency"],
  ["开关频率", "switchingfrequency", "fsw"],
  ["分辨率", "resolution", "bits"],
  ["采样率", "samplerate", "throughput", "conversionrate"],
  ["类型", "器件类型", "type", "devicetype"],
  ["应用", "典型应用", "application", "applications"],
  ["主频", "工作主频", "最高主频", "cpufrequency", "maxfrequency", "clockfrequency"],
  ["cmrr", "共模抑制比", "commonmoderejection"],
  ["psrr", "电源抑制比", "powersupplyrejection"],
  ["噪声系数", "noisefigure", "nf"],
  ["导通电阻", "rdson", "rds"],
  ["栅电荷", "qg", "totalgatecharge"],
];

const SYN_INDEX = (() => {
  const m = new Map();
  SYNONYMS.forEach((group, gi) => group.forEach(n => m.set(normalizeName(n), gi)));
  return m;
})();

/** 两个参数名是否指同一参数 */
function sameParam(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ga = SYN_INDEX.get(na), gb = SYN_INDEX.get(nb);
  if (ga !== undefined && ga === gb) return true;
  // 包含关系需足够长，避免「增益」误配「增益带宽积」
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) {
    // 但若两者分属不同同义词组，则判定为不同参数
    if (ga !== undefined && gb !== undefined && ga !== gb) return false;
    return true;
  }
  return false;
}

/**
 * 把候选的参数列表对齐到原型号的参数 id 上
 * @param candParams 候选参数数组 [{name,nameEn,value,unit,source,...}]
 * @param referenceParams 原型号参数数组
 * @param meta { source, sourceLabel, confidence }
 */
function alignParams(candParams, referenceParams, meta = {}) {
  const aligned = {};
  const used = new Set();
  for (const ref of referenceParams) {
    let match = null;
    // 1) 中文名 / 英文名 精确或同义
    for (let i = 0; i < candParams.length; i++) {
      if (used.has(i)) continue;
      const c = candParams[i];
      if (sameParam(c.name, ref.name) || sameParam(c.nameEn, ref.nameEn) ||
          sameParam(c.name, ref.nameEn) || sameParam(c.nameEn, ref.name)) {
        match = c; used.add(i); break;
      }
    }
    aligned[ref.id] = match
      ? {
          value: match.value,
          unit: match.unit || ref.unit || "",
          source: match.source || meta.source || "ezplm",
          sourceLabel: match.sourceLabel || meta.sourceLabel || "ezPLM",
          confidence: match.confidence || meta.confidence || "high",
          verified: match.verified,
          matchedName: match.name,          // 便于排查对齐结果
        }
      : { value: "N/A", unit: ref.unit || "", source: "", sourceLabel: "", confidence: "none" };
  }
  return aligned;
}

/** 对齐诊断：返回未匹配上的原型号参数与候选中未被使用的参数 */
function alignReport(candParams, referenceParams) {
  const aligned = alignParams(candParams, referenceParams);
  const missing = referenceParams.filter(r => aligned[r.id].value === "N/A").map(r => r.name);
  const matchedNames = new Set(Object.values(aligned).map(a => a.matchedName).filter(Boolean));
  const unused = candParams.filter(c => !matchedNames.has(c.name)).map(c => c.name);
  return { aligned, missing, unused,
    coverage: referenceParams.length ? Math.round((1 - missing.length / referenceParams.length) * 100) : 0 };
}

module.exports = { alignParams, alignReport, sameParam, normalizeName, SYNONYMS };
