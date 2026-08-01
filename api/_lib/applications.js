// applications.js — 应用领域场景（同一器件在不同应用下替代料不同）
//
// 核心洞察：TPS62160 用在「电池供电穿戴」时，静态电流(Iq)是第一约束；
// 用在「工业控制」时，宽温和EMC是第一约束；用在「消费电子降本」时，单价才是。
// 场景不仅改变参数权重，还改变硬约束和必需证据。

const APPLICATIONS = {
  generic: {
    label: "通用/不限", icon: "🔧",
    desc: "按参数整体接近度推荐",
    priorityHints: [], hardHints: [],
    aiHint: "",
  },
  battery: {
    label: "电池供电/穿戴", icon: "🔋",
    desc: "低静态电流、轻载效率优先",
    priorityHints: ["静态电流", "Quiescent", "Iq", "效率", "Efficiency", "关断电流", "工作电压"],
    hardHints: ["静态电流", "工作电压"],
    aiHint: "应用场景：电池供电/可穿戴设备。首要关注极低静态电流(Iq)、轻载效率、低压启动能力；封装尺寸要小。避免高Iq的老型号。",
  },
  industrial: {
    label: "工业控制", icon: "🏭",
    desc: "宽温、宽压、高可靠、长供货",
    priorityHints: ["工作温度", "Temperature", "工作电压", "输入电压", "ESD", "PSRR", "封装"],
    hardHints: ["工作温度"],
    aiHint: "应用场景：工业控制。必须工业级温宽(-40~85°C以上)，优先宽输入电压、强EMC/ESD耐受、长期供货(非NRND)。优先车规/工业级认证型号。",
  },
  automotive: {
    label: "汽车电子", icon: "🚗",
    desc: "AEC-Q100、宽温、高可靠",
    priorityHints: ["工作温度", "Temperature", "认证", "Qualification", "ESD", "工作电压"],
    hardHints: ["工作温度"],
    aiHint: "应用场景：汽车电子。必须AEC-Q100/Q101车规认证，温度等级至少-40~125°C，优先有功能安全(ISO26262)支持的型号。非车规型号不要推荐。",
  },
  consumer: {
    label: "消费电子降本", icon: "💰",
    desc: "成本优先，功能够用即可",
    priorityHints: ["参考价格", "Price", "封装", "效率"],
    hardHints: [],
    aiHint: "应用场景：消费电子大批量。成本是第一优先，功能够用即可；优先国产/二线品牌中性能达标的低价方案，关注大批量供货能力。",
  },
  precision: {
    label: "精密测量/仪器", icon: "📐",
    desc: "低噪声、低失调、高精度",
    priorityHints: ["噪声", "Noise", "失调", "Offset", "漂移", "Drift", "INL", "分辨率", "CMRR", "精度"],
    hardHints: ["噪声", "失调"],
    aiHint: "应用场景：精密测量仪器。首要关注低噪声密度、低输入失调及其温漂、高线性度(INL/DNL)、高CMRR/PSRR。价格不敏感，精度指标不可妥协。",
  },
  rf: {
    label: "射频/高速", icon: "📡",
    desc: "带宽、噪声系数、阻抗匹配",
    priorityHints: ["带宽", "Bandwidth", "GBW", "噪声", "Noise", "增益", "Gain", "压摆率", "Slew"],
    hardHints: ["带宽"],
    aiHint: "应用场景：射频/高速信号链。首要关注带宽、噪声系数、增益平坦度、压摆率；封装寄生参数敏感，优先小封装。",
  },
  medical: {
    label: "医疗设备", icon: "🏥",
    desc: "低噪声、高可靠、认证要求",
    priorityHints: ["噪声", "Noise", "漏电流", "Leakage", "工作温度", "认证", "失调"],
    hardHints: [],
    aiHint: "应用场景：医疗设备。关注低噪声、低漏电流、高可靠性与长期稳定供货；需考虑医疗认证与患者安全隔离要求。",
  },
  education: {
    label: "教学/竞赛", icon: "🎓",
    desc: "易采购、资料丰富、价格低",
    priorityHints: ["参考价格", "Price", "封装"],
    hardHints: [],
    aiHint: "应用场景：教学与电子竞赛。优先易采购(立创/淘宝现货)、开发资料和例程丰富、价格低、封装便于手工焊接(优先DIP/SOP等大封装)的型号。",
  },
};

/** 按应用场景重排参数优先级：命中关键词的参数提到前面 */
function applyScenarioPriority(params, appCode) {
  const app = APPLICATIONS[appCode];
  if (!app || !app.priorityHints.length) return params.map(p => p.id);
  const score = p => {
    const text = `${p.name} ${p.nameEn || ""}`;
    const idx = app.priorityHints.findIndex(h => text.includes(h));
    return idx < 0 ? 999 : idx;
  };
  return [...params].sort((a, b) => score(a) - score(b)).map(p => p.id);
}

/** 场景建议的硬约束参数（前端可预勾选提示） */
function scenarioHardParams(params, appCode) {
  const app = APPLICATIONS[appCode];
  if (!app) return [];
  return params.filter(p => app.hardHints.some(h => `${p.name} ${p.nameEn || ""}`.includes(h))).map(p => p.id);
}

function getApplicationHint(appCode) {
  return APPLICATIONS[appCode]?.aiHint || "";
}

module.exports = { APPLICATIONS, applyScenarioPriority, scenarioHardParams, getApplicationHint };
