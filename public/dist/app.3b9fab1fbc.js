const {
  useState,
  useEffect,
  useRef
} = React;
const APP_VERSION = "6.9.7";
const C = {
  green: "#1a6c4e",
  greenLight: "#e8f5ef",
  greenMid: "#c2e5d3",
  greenAccent: "#2d9d6f",
  bg: "#fff",
  bgSoft: "#f7faf8",
  border: "#d4e8dc",
  borderLight: "#e8f0ec",
  text: "#1a2e23",
  textSec: "#4a6b58",
  textMute: "#8aa698",
  indigo: "#4f5fa3",
  indigoBg: "#eef0f8",
  indigoBorder: "#c9cfe6",
  amber: "#b8860b",
  amberBg: "#fef9ed"
};
function scoreColor(s) {
  return s >= 90 ? C.green : s >= 75 ? "#b8860b" : s >= 60 ? "#c2610c" : "#c0392b";
}
function scoreBg(s) {
  return s >= 90 ? "#e8f5ef" : s >= 75 ? "#fef9ed" : s >= 60 ? "#fef3e6" : "#fdeaea";
}
const VP_BTN = {
  width: 32,
  height: 30,
  borderRadius: 6,
  border: "1px solid #b8c7dc",
  background: "rgba(255,255,255,.94)",
  color: "#29415f",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1
};
const FLOW_BASE = {
  padding: "5px 11px",
  borderRadius: 6,
  whiteSpace: "nowrap",
  flexShrink: 0
};
const FLOW_A = {
  ...FLOW_BASE,
  background: "#e8f5ef",
  border: "1px solid #c2e5d3",
  fontWeight: 600
};
const FLOW_B = {
  ...FLOW_BASE,
  background: "#eef0f8",
  border: "1px solid #c9cfe6"
};
const FLOW_C = {
  ...FLOW_BASE,
  background: "#EEEDFE",
  border: "1px solid #AFA9EC"
};
const FLOW_D = {
  ...FLOW_BASE,
  background: "#fef9ed",
  border: "1px solid #f0dca0"
};
const FLOW_E = {
  ...FLOW_BASE,
  background: "#1a6c4e",
  color: "#fff",
  fontWeight: 600
};
const FLOW_ARROW = {
  flexShrink: 0,
  color: "#8aa698"
};
const RES_BTN = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid #d4e8dc",
  background: "#fff",
  color: "#4a6b58",
  fontSize: 11,
  textDecoration: "none",
  whiteSpace: "nowrap"
};

// 场景优先关键词（与后端 applications.js 保持一致；前端据此真实重排，而非只改文案）
const APP_PRIORITY = {
  generic: [],
  battery: ["静态电流", "quiescent", "iq", "效率", "efficiency", "关断", "工作电压", "supply"],
  industrial: ["工作温度", "temperature", "工作电压", "输入电压", "esd", "psrr", "封装"],
  automotive: ["工作温度", "temperature", "认证", "qualification", "aec", "esd", "工作电压"],
  consumer: ["参考价格", "price", "封装", "package", "效率"],
  precision: ["噪声", "noise", "失调", "offset", "漂移", "drift", "inl", "分辨率", "cmrr", "精度"],
  rf: ["带宽", "bandwidth", "gbw", "噪声", "noise", "增益", "gain", "压摆率", "slew"],
  medical: ["噪声", "noise", "漏电流", "leakage", "工作温度", "失调"],
  education: ["参考价格", "price", "封装"]
};
// 以下三项在应用领域筛选移除后仅由导出元信息使用；
// 后端仍保留 application 维度（供 ezPLM 走 API 调用），故不删除定义。
const APP_HARD = {
  battery: ["静态电流", "工作电压"],
  industrial: ["工作温度"],
  automotive: ["工作温度"],
  precision: ["噪声", "失调"],
  rf: ["带宽"]
};

/** 按场景重排参数：命中关键词的提前，保持其余相对顺序 */
function reorderByApplication(params, appCode) {
  const hints = APP_PRIORITY[appCode] || [];
  if (!hints.length) return params.slice();
  const rank = p => {
    const t = `${p.name || ""} ${p.nameEn || ""}`.toLowerCase();
    const i = hints.findIndex(h => t.includes(String(h).toLowerCase()));
    return i < 0 ? 999 : i;
  };
  return params.map((p, i) => ({
    p,
    i
  })).sort((a, b) => {
    const ra = rank(a.p),
      rb = rank(b.p);
    return ra !== rb ? ra - rb : a.i - b.i;
  }).map(x => x.p);
}
const APPLICATIONS = [{
  code: "generic",
  label: "通用/不限",
  icon: "🔧",
  desc: "按参数整体接近度"
}, {
  code: "battery",
  label: "电池供电/穿戴",
  icon: "🔋",
  desc: "低静态电流、轻载效率"
}, {
  code: "industrial",
  label: "工业控制",
  icon: "🏭",
  desc: "宽温宽压、高可靠"
}, {
  code: "automotive",
  label: "汽车电子",
  icon: "🚗",
  desc: "AEC-Q100车规"
}, {
  code: "consumer",
  label: "消费电子降本",
  icon: "💰",
  desc: "成本优先"
}, {
  code: "precision",
  label: "精密测量",
  icon: "📐",
  desc: "低噪声低失调"
}, {
  code: "rf",
  label: "射频/高速",
  icon: "📡",
  desc: "带宽噪声系数"
}, {
  code: "medical",
  label: "医疗设备",
  icon: "🏥",
  desc: "低噪声高可靠"
}, {
  code: "education",
  label: "教学/竞赛",
  icon: "🎓",
  desc: "易采购资料多"
}];
const SUB_MODES = [{
  id: "pin2pin",
  label: "Pin-to-Pin",
  desc: "引脚完全兼容"
}, {
  id: "pkgCompat",
  label: "封装兼容",
  desc: "相同封装可直接替换"
}, {
  id: "funcCompat",
  label: "功能兼容",
  desc: "功能相近但可能需改板"
}, {
  id: "domestic",
  label: "国产替代",
  desc: "优先推荐国产品牌"
}, {
  id: "lowCost",
  label: "低成本优先",
  desc: "价格最优方案"
}];
const POPULAR_MFRS = ["Texas Instruments", "Analog Devices", "STMicroelectronics", "Microchip", "NXP", "Infineon", "onsemi", "Renesas", "Rohm", "圣邦微电子", "思瑞浦", "兆易创新", "沁恒微电子", "极海半导体", "国民技术", "士兰微", "矽力杰", "杰华特", "南芯半导体"];

// ═══ 演示数据（后端不可用时兜底）═══
const MOCK_ORIGINAL = {
  partNumber: "STM32F103C8T6",
  manufacturer: "STMicroelectronics",
  category: "微控制器",
  description: "主流型Cortex-M3微控制器",
  _dataPath: "demo",
  internalPN: "EE-IC-0042",
  parameters: [{
    id: "param_1",
    name: "内核架构",
    nameEn: "Core Architecture",
    value: "ARM Cortex-M3",
    unit: ""
  }, {
    id: "param_2",
    name: "工作主频",
    nameEn: "Maximum CPU Frequency",
    value: "72",
    unit: "MHz"
  }, {
    id: "param_3",
    name: "Flash容量",
    nameEn: "Flash Memory Size",
    value: "64",
    unit: "KB"
  }, {
    id: "param_4",
    name: "RAM容量",
    nameEn: "SRAM Size",
    value: "20",
    unit: "KB"
  }, {
    id: "param_5",
    name: "工作电压",
    nameEn: "Operating Voltage",
    value: "2.0-3.6",
    unit: "V"
  }, {
    id: "param_6",
    name: "I/O数量",
    nameEn: "Number of I/Os",
    value: "37",
    unit: ""
  }, {
    id: "param_7",
    name: "封装",
    nameEn: "Package",
    value: "LQFP48",
    unit: ""
  }, {
    id: "param_8",
    name: "参考价格",
    nameEn: "Reference Price",
    value: "2.14",
    unit: "USD"
  }, {
    id: "param_9",
    name: "工作温度范围",
    nameEn: "Operating Temperature Range",
    value: "-40-85",
    unit: "°C"
  }, {
    id: "param_10",
    name: "通信接口",
    nameEn: "Interfaces",
    value: "UART×3,SPI×2,I2C×2,CAN,USB",
    unit: ""
  }]
};
const MOCK_RECS = [{
  partNumber: "GD32F103C8T6",
  manufacturer: "兆易创新 (GigaDevice)",
  description: "国产主流替代型号，主频更高，引脚兼容",
  isPreferred: true,
  inPLM: true,
  overallScore: 88,
  technical: 91,
  evidenceCoverage: 100,
  sourceConfidence: 100,
  confidence: 88,
  pinVerified: false,
  replacementLevel: {
    level: "P2",
    label: "Pin-to-Pin候选",
    color: "#2d9d6f",
    desc: "参数高度匹配，引脚需人工核对"
  },
  dataSource: "本地数据库",
  paramScores: [{
    paramId: "param_1",
    paramName: "内核架构",
    value: "ARM Cortex-M3",
    unit: "",
    score: 100,
    comment: "完全一致",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }, {
    paramId: "param_2",
    paramName: "工作主频",
    value: "108",
    unit: "MHz",
    score: 100,
    comment: "优于原厂",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }, {
    paramId: "param_3",
    paramName: "Flash容量",
    value: "64",
    unit: "KB",
    score: 100,
    comment: "完全一致",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }, {
    paramId: "param_4",
    paramName: "RAM容量",
    value: "20",
    unit: "KB",
    score: 100,
    comment: "完全一致",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }, {
    paramId: "param_5",
    paramName: "工作电压",
    value: "2.6-3.6",
    unit: "V",
    score: 95,
    comment: "电压范围略窄",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }, {
    paramId: "param_6",
    paramName: "I/O数量",
    value: "37",
    unit: "",
    score: 100,
    comment: "引脚兼容",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }, {
    paramId: "param_7",
    paramName: "封装",
    value: "LQFP48",
    unit: "",
    score: 100,
    comment: "封装一致",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }, {
    paramId: "param_8",
    paramName: "参考价格",
    value: "1.10",
    unit: "USD",
    score: 100,
    comment: "成本优势明显",
    known: true,
    source: "lcsc",
    sourceLabel: "立创"
  }, {
    paramId: "param_9",
    paramName: "工作温度范围",
    value: "-40-85",
    unit: "°C",
    score: 100,
    comment: "工业级标准",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }, {
    paramId: "param_10",
    paramName: "通信接口",
    value: "UART×3,SPI×2,I2C×2,CAN,USB",
    unit: "",
    score: 100,
    comment: "一致",
    known: true,
    source: "ezplm",
    sourceLabel: "本地数据库"
  }]
}, {
  partNumber: "APM32F103C8T6",
  manufacturer: "极海半导体 (Geehy)",
  description: "高兼容性替代方案，工业级设计",
  isPreferred: true,
  inPLM: true,
  overallScore: 79,
  technical: 89,
  evidenceCoverage: 91,
  sourceConfidence: 85,
  confidence: 79,
  pinVerified: false,
  replacementLevel: {
    level: "B",
    label: "硬件兼容",
    color: "#2d9d6f",
    desc: "封装兼容，软件/配置需验证"
  },
  dataSource: "本地数据库",
  paramScores: []
}, {
  partNumber: "CH32F103C8T6",
  manufacturer: "沁恒微电子 (WCH)",
  description: "国产经济型替代，主频一致，封装兼容",
  isPreferred: false,
  inPLM: false,
  overallScore: 67,
  technical: 88,
  evidenceCoverage: 82,
  sourceConfidence: 45,
  confidence: 67,
  pinVerified: false,
  replacementLevel: {
    level: "F",
    label: "功能替代",
    color: "#c2610c",
    desc: "参数来自AI搜索，需补充datasheet证据"
  },
  dataSource: "AI搜索",
  paramScores: []
}];
const MOCK_DETAILS = {
  "GD32F103C8T6": {
    inPLM: true,
    internalPN: "EE-IC-0118",
    approved: true,
    usedInProjects: ["PRJ-2024-022"],
    suppliers: [{
      name: "深圳华秋电子",
      type: "distributor",
      stock: 25000,
      moq: 10,
      leadTimeDays: 1,
      tiers: [{
        qty: 10,
        price: "¥8.20"
      }, {
        qty: 100,
        price: "¥7.50"
      }, {
        qty: 1000,
        price: "¥6.80"
      }],
      lastQuoteDate: "2026-03-28"
    }, {
      name: "立创商城",
      type: "distributor",
      stock: 48200,
      moq: 1,
      leadTimeDays: 1,
      tiers: [{
        qty: 1,
        price: "¥8.50"
      }, {
        qty: 30,
        price: "¥7.90"
      }, {
        qty: 500,
        price: "¥7.10"
      }],
      lastQuoteDate: "2026-04-01"
    }, {
      name: "兆易创新(原厂)",
      type: "manufacturer",
      stock: null,
      moq: 3000,
      leadTimeDays: 42,
      tiers: [{
        qty: 3000,
        price: "¥6.20"
      }, {
        qty: 10000,
        price: "¥5.80"
      }],
      lastQuoteDate: "2026-03-15"
    }],
    inventory: {
      internal: 850,
      reserved: 200,
      available: 650,
      location: "深圳仓-A12"
    },
    priceHistory: [{
      date: "2026-01",
      price: 7.2
    }, {
      date: "2026-02",
      price: 7.0
    }, {
      date: "2026-03",
      price: 6.9
    }, {
      date: "2026-04",
      price: 6.8
    }],
    qualityRecords: [{
      date: "2026-02-18",
      batch: "B240218",
      result: "合格",
      note: "来料检验通过, AQL 0.65"
    }]
  }
};

// ═══ 通用组件 ═══
function ScoreRing({
  score,
  size = 56
}) {
  const r = (size - 8) / 2,
    circ = 2 * Math.PI * r,
    offset = circ * (1 - score / 100),
    color = scoreColor(score);
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: C.borderLight,
    strokeWidth: "4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: color,
    strokeWidth: "4",
    strokeDasharray: circ,
    strokeDashoffset: offset,
    strokeLinecap: "round",
    transform: `rotate(-90 ${size / 2} ${size / 2})`
  }), /*#__PURE__*/React.createElement("text", {
    x: size / 2,
    y: size / 2 + 1,
    textAnchor: "middle",
    dominantBaseline: "central",
    fill: color,
    fontSize: size * 0.28,
    fontWeight: "700",
    fontFamily: "'DM Mono',monospace"
  }, score));
}
function LevelBadge({
  level
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "3px 10px",
      borderRadius: 5,
      background: level.color,
      color: "#fff",
      fontSize: 12,
      fontWeight: 700
    }
  }, "[", level.level, "] ", level.label);
}
function SourceTag({
  source,
  sourceLabel
}) {
  if (!source) return null;
  const isAI = source === "ai_search" || source === "ai_lookup";
  const color = isAI ? C.amber : C.green,
    bg = isAI ? C.amberBg : C.greenLight;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: "1px 5px",
      borderRadius: 3,
      background: bg,
      color,
      border: `1px solid ${color}40`
    }
  }, "\uD83D\uDCCE ", sourceLabel || source, " ", isAI ? "⚠" : "✓");
}
function parsePackage(name) {
  if (!name) return null;
  const s = String(name).toUpperCase().replace(/\s/g, "");
  // 前置引脚数写法：10-LEAD MSOP / 20-PIN TSSOP / 8PIN SOIC
  const lead = s.match(/(\d+)-?(?:LEAD|PIN|P\b)/);
  const num = re => {
    const m = s.match(re);
    return m ? parseInt(m[1]) : null;
  };
  const pinOf = fallback => lead ? parseInt(lead[1]) : fallback;
  // 片式元件 0402/0603/0805/1206
  const chip = s.match(/\b(0201|0402|0603|0805|1206|1210|2010|2512)\b/);
  if (chip) {
    const sizes = {
      "0201": [0.6, 0.3],
      "0402": [1.0, 0.5],
      "0603": [1.6, 0.8],
      "0805": [2.0, 1.25],
      "1206": [3.2, 1.6],
      "1210": [3.2, 2.5],
      "2010": [5.0, 2.5],
      "2512": [6.3, 3.2]
    };
    const [L, W] = sizes[chip[1]];
    return {
      type: "chip",
      pins: 2,
      bodyW: L,
      bodyH: W,
      label: chip[1]
    };
  }
  // QFN/DFN 四边或两边
  if (/QFN|DFN|VQFN|WQFN|SON/.test(s)) {
    const n = num(/(?:QFN|DFN|SON)-?(\d+)/) || pinOf(null) || 16;
    const sz = s.match(/(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)MM/) || s.match(/(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)/);
    return {
      type: "qfn",
      pins: n,
      bodyW: sz ? parseFloat(sz[1]) : 3,
      bodyH: sz ? parseFloat(sz[2]) : 3,
      hasEP: /EP|1EP/.test(s),
      label: name
    };
  }
  // QFP/LQFP/TQFP 四边引脚
  if (/QFP/.test(s)) {
    const n = num(/QFP-?(\d+)/) || pinOf(null) || 48;
    return {
      type: "qfp",
      pins: n,
      bodyW: 7,
      bodyH: 7,
      label: name
    };
  }
  // SOIC/SOP/SSOP/TSSOP/MSOP 两边
  if (/SOIC|SOP|SSOP|TSSOP|MSOP|VSSOP|SO-/.test(s)) {
    const n = num(/(?:SOIC|SOP|SSOP|TSSOP|MSOP|VSSOP)-?(\d+)/) || pinOf(null) || 8;
    const sz = s.match(/(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)MM/);
    return {
      type: "soic",
      pins: n,
      bodyW: sz ? parseFloat(sz[1]) : n <= 8 ? 4 : n <= 16 ? 6 : 8,
      bodyH: sz ? parseFloat(sz[2]) : n <= 8 ? 5 : n <= 16 ? 6 : 8,
      label: name
    };
  }
  // SOT-23 系列
  if (/SOT-?23|SOT-?89|SOT-?223|TSOT/.test(s)) {
    const n = num(/-(\d+)$/) || pinOf(null) || 3;
    return {
      type: "sot",
      pins: n,
      bodyW: 2.9,
      bodyH: 1.6,
      label: name
    };
  }
  // DIP
  if (/DIP|PDIP/.test(s)) {
    const n = num(/(?:DIP)-?(\d+)/) || pinOf(null) || 8;
    return {
      type: "dip",
      pins: n,
      bodyW: 7,
      bodyH: n * 1.27,
      label: name
    };
  }
  // BGA
  if (/BGA/.test(s)) {
    const n = num(/BGA-?(\d+)/) || pinOf(null) || 64;
    return {
      type: "bga",
      pins: n,
      bodyW: 8,
      bodyH: 8,
      label: name
    };
  }
  return {
    type: "generic",
    pins: pinOf(null) || num(/-(\d+)/) || 8,
    bodyW: 5,
    bodyH: 5,
    label: name
  };
}

// ═══════════════════════════════════════════════════════════
// KiCad 解析与渲染（移植自 kicad-part-viewer）
// 架构要点：无真实文件时生成 .kicad_mod 文本，与真实文件走同一条渲染管线
// ═══════════════════════════════════════════════════════════

// 引脚号规范化：符号写 "3"、封装写 3 或 " 3 "，EP/PAD/NC 大小写不一，必须归一后比较
// 厂商别名归一：线上曾允许同时添加 "Texas Instruments" 与 "texas instruments"
const MFR_ALIAS = [[/texas\s*instruments|^ti$/i, "TEXAS_INSTRUMENTS"], [/analog\s*devices|^adi$|linear\s*tech/i, "ANALOG_DEVICES"], [/stmicro|^st$/i, "STMICROELECTRONICS"], [/microchip|^atmel$/i, "MICROCHIP"], [/nxp|freescale/i, "NXP"], [/infineon|international\s*rectifier|cypress/i, "INFINEON"], [/on\s*semi|onsemi|fairchild/i, "ONSEMI"], [/maxim/i, "MAXIM"], [/renesas|intersil/i, "RENESAS"], [/兆易创新|gigadevice/i, "GIGADEVICE"], [/沁恒|^wch$/i, "WCH"], [/圣邦微|sgmicro/i, "SGMICRO"], [/思瑞浦|3peak/i, "3PEAK"], [/极海|geehy/i, "GEEHY"], [/矽力杰|silergy/i, "SILERGY"]];
function canonMfr(n) {
  const s = String(n || "").trim();
  if (!s) return "";
  for (const [re, id] of MFR_ALIAS) if (re.test(s)) return id;
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

// 参数值格式化：值里已含单位时不再拼接（ALT-007："64 KB KB"、"72 MHz MHz"）
const _NA_RE = /^(n\/?a|na|—|-|--|tbd|unknown|未知|无)$/i;
function hasUnitAlready(value, unit) {
  if (!unit) return true;
  const v = String(value).trim(),
    u = String(unit).trim();
  if (!v || !u) return true;
  const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc + "\\s*(\\([^)]*\\)|（[^）]*）)?$", "i").test(v) || new RegExp("\\d\\s*" + esc + "\\b", "i").test(v);
}
function normMulti(v) {
  const raw = String(v ?? "");
  if (!raw.includes("||")) return raw;
  const parts = raw.split("||").map(x => x.trim()).filter(Boolean);
  if (!parts.length) return raw;
  const allNum = parts.every(x => /^[-+±]?[\d.]+\s*[a-zA-ZΩ°µμ%]*$/.test(x));
  return parts.join(allNum ? " / " : "、");
}
function fmtVal(value, unit) {
  if (value === undefined || value === null) return "N/A";
  const v = normMulti(String(value).trim()).trim();
  if (!v || _NA_RE.test(v)) return "N/A";
  if (!unit) return v;
  if (hasUnitAlready(v, unit)) return v;
  if (!/^[-+±]?[\d.]/.test(v)) return v;
  return v + " " + unit;
}
function normPin(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return "";
  if (/^(EP|E\.?P\.?|PAD|THERMAL(PAD)?|EXPOSED(PAD)?)$/.test(s)) return "EP";
  if (/^(NC|N\.?C\.?|DNC|NOCONNECT)$/.test(s)) return "NC";
  return s.replace(/^0+(?=\d)/, "");
}
const samePin = (a, b) => {
  const x = normPin(a),
    y = normPin(b);
  return !!x && x === y;
};

// ezPLM 的文件 URL（七牛云私有空间）带时效签名且需要鉴权，
// 浏览器直连会拿到 nginx 的 401 Authorization Required；必须经同源代理取。
// 但 datasheet 也可能落在厂商官网/分销商域名上，那些直连才对，代过去反而被代理的
// 主机白名单挡成 403 —— 所以按主机判断，与后端 ezplm-resource 的白名单保持一致。
const PROXY_HOSTS = [/(^|\.)ezplm\.com$/i, /(^|\.)ezplm\.cn$/i, /^raw\.githubusercontent\.com$/i];
function needsProxy(u) {
  try {
    return PROXY_HOSTS.some(re => re.test(new URL(u).hostname));
  } catch {
    return false;
  }
}
const proxyRes = u => !u || typeof u !== "string" ? "" : /^https?:\/\//i.test(u) ? `/api/ezplm-resource?url=${encodeURIComponent(u)}` : u;
/** 供用户点击的资源链接：ezPLM 资源走代理，站外链接保持直连 */
const resHref = u => !u || typeof u !== "string" ? "" : needsProxy(u) ? proxyRes(u) : u;

// ── S-expression 块提取（容错强于完整解析器，适合 kicad_mod）──
function sexprBlocks(txt, keyword) {
  const blocks = [];
  let pos = 0;
  while ((pos = txt.indexOf(`(${keyword}`, pos)) >= 0) {
    let depth = 0,
      end = pos,
      inStr = false,
      esc = false;
    for (let i = pos; i < txt.length; i++) {
      const c = txt[i];
      if (inStr) {
        if (esc) esc = false;else if (c === "\\") esc = true;else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;else if (c === "(") depth++;else if (c === ")") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
    }
    blocks.push(txt.slice(pos, end));
    pos = end;
  }
  return blocks;
}

// ── 封装名 → 合成 kicad_mod（无真实文件时兜底，走同一渲染路径）──
function synthKicadMod(pkgName) {
  const g = parsePackage(pkgName);
  if (!g) return "";
  const {
    type,
    pins,
    bodyW: bw,
    bodyH: bh,
    hasEP
  } = g;
  let pads = "";
  if (type === "chip") {
    const px = bw * 0.55;
    pads = `(pad 1 smd rect (at -${px.toFixed(2)} 0) (size ${(bw * 0.4).toFixed(2)} ${(bh * 1.1).toFixed(2)}) (layers F.Cu))
(pad 2 smd rect (at ${px.toFixed(2)} 0) (size ${(bw * 0.4).toFixed(2)} ${(bh * 1.1).toFixed(2)}) (layers F.Cu))`;
  } else if (type === "sot") {
    const n = pins;
    if (n === 3) {
      pads = `(pad 1 smd rect (at -1.1 0.95) (size 1.0 0.8) (layers F.Cu))
(pad 2 smd rect (at -1.1 -0.95) (size 1.0 0.8) (layers F.Cu))
(pad 3 smd rect (at 1.1 0) (size 1.0 0.8) (layers F.Cu))`;
    } else {
      const per = Math.ceil(n / 2),
        pitch = 0.95;
      for (let i = 0; i < per; i++) {
        const y = -(per - 1) * pitch / 2 + i * pitch;
        pads += `\n(pad ${i + 1} smd rect (at -1.1 ${y.toFixed(2)}) (size 1.0 0.6) (layers F.Cu))`;
        if (n - i > per) pads += `\n(pad ${n - i} smd rect (at 1.1 ${y.toFixed(2)}) (size 1.0 0.6) (layers F.Cu))`;
      }
    }
  } else if (type === "dip") {
    const per = Math.ceil(pins / 2),
      pitch = 2.54,
      off = bw / 2;
    for (let i = 0; i < per; i++) {
      const y = -(per - 1) * pitch / 2 + i * pitch;
      pads += `\n(pad ${i + 1} thru_hole ${i === 0 ? "rect" : "circle"} (at -${off} ${y.toFixed(2)}) (size 1.6 1.6) (layers *.Cu))`;
      pads += `\n(pad ${pins - i} thru_hole circle (at ${off} ${y.toFixed(2)}) (size 1.6 1.6) (layers *.Cu))`;
    }
  } else if (type === "qfn" || type === "qfp") {
    const per = Math.max(1, Math.ceil(pins / 4)),
      pitch = bw / (per + 0.6);
    const ext = type === "qfn" ? 0.35 : 0.9,
      padL = type === "qfn" ? 0.5 : 1.1,
      padW = Math.max(0.2, pitch * 0.55);
    if (hasEP) pads += `\n(pad 9 smd rect (at 0 0) (size ${(bw * 0.5).toFixed(2)} ${(bh * 0.5).toFixed(2)}) (layers F.Cu))`;
    for (let i = 0; i < per; i++) {
      const q = -((per - 1) * pitch) / 2 + i * pitch;
      pads += `\n(pad ${i + 1} smd rect (at -${(bw / 2 + ext).toFixed(2)} ${q.toFixed(2)}) (size ${padL} ${padW.toFixed(2)}) (layers F.Cu))`;
      pads += `\n(pad ${i + 1 + per} smd rect (at ${q.toFixed(2)} ${(bh / 2 + ext).toFixed(2)}) (size ${padW.toFixed(2)} ${padL}) (layers F.Cu))`;
      pads += `\n(pad ${i + 1 + per * 2} smd rect (at ${(bw / 2 + ext).toFixed(2)} ${(-q).toFixed(2)}) (size ${padL} ${padW.toFixed(2)}) (layers F.Cu))`;
      pads += `\n(pad ${i + 1 + per * 3} smd rect (at ${(-q).toFixed(2)} -${(bh / 2 + ext).toFixed(2)}) (size ${padW.toFixed(2)} ${padL}) (layers F.Cu))`;
    }
  } else if (type === "bga") {
    const n = Math.ceil(Math.sqrt(pins)),
      pitch = bw / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = -bw / 2 + pitch * (c + 0.5),
        y = -bh / 2 + pitch * (r + 0.5);
      pads += `\n(pad ${r * n + c + 1} smd circle (at ${x.toFixed(2)} ${y.toFixed(2)}) (size ${(pitch * 0.55).toFixed(2)} ${(pitch * 0.55).toFixed(2)}) (layers F.Cu))`;
    }
  } else {
    // soic / generic 两侧引脚
    const per = Math.ceil(pins / 2),
      pitch = Math.min(1.27, bh / (per + 0.4)),
      off = bw / 2 + 0.8;
    for (let i = 0; i < per; i++) {
      const y = -(per - 1) * pitch / 2 + i * pitch;
      pads += `\n(pad ${i + 1} smd ${i === 0 ? "rect" : "roundrect"} (at -${off.toFixed(2)} ${y.toFixed(2)}) (size 1.5 ${(pitch * 0.5).toFixed(2)}) (layers F.Cu))`;
      if (pins - i > per) pads += `\n(pad ${pins - i} smd roundrect (at ${off.toFixed(2)} ${y.toFixed(2)}) (size 1.5 ${(pitch * 0.5).toFixed(2)}) (layers F.Cu))`;
    }
  }
  const hw = bw / 2,
    hh = bh / 2;
  return `(module SYNTH (layer F.Cu)
(fp_line (start ${-hw} ${-hh}) (end ${hw} ${-hh}) (layer F.SilkS) (width 0.12))
(fp_line (start ${hw} ${-hh}) (end ${hw} ${hh}) (layer F.SilkS) (width 0.12))
(fp_line (start ${hw} ${hh}) (end ${-hw} ${hh}) (layer F.SilkS) (width 0.12))
(fp_line (start ${-hw} ${hh}) (end ${-hw} ${-hh}) (layer F.SilkS) (width 0.12))
(fp_line (start ${-hw - 0.4} ${-hh - 0.4}) (end ${hw + 0.4} ${-hh - 0.4}) (layer F.CrtYd) (width 0.05))
(fp_line (start ${hw + 0.4} ${-hh - 0.4}) (end ${hw + 0.4} ${hh + 0.4}) (layer F.CrtYd) (width 0.05))
(fp_line (start ${hw + 0.4} ${hh + 0.4}) (end ${-hw - 0.4} ${hh + 0.4}) (layer F.CrtYd) (width 0.05))
(fp_line (start ${-hw - 0.4} ${hh + 0.4}) (end ${-hw - 0.4} ${-hh - 0.4}) (layer F.CrtYd) (width 0.05))
${pads}
)`;
}

// ── 封装渲染：解析 kicad_mod → SVG（真实几何）──
function renderFootprintToSvg(txt, svg, onPinClick, selectedPin) {
  svg.innerHTML = "";
  const vb = svg.viewBox?.baseVal,
    w = vb?.width || 800,
    h = vb?.height || 520;
  const mk = (t, a = {}) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", t);
    Object.entries(a).forEach(([k, v]) => v != null && e.setAttribute(k, v));
    return e;
  };
  const graphics = [];
  for (const b of sexprBlocks(txt, "fp_line")) {
    const a = b.match(/\(start\s+([-\d.]+)\s+([-\d.]+)\)/),
      e = b.match(/\(end\s+([-\d.]+)\s+([-\d.]+)\)/),
      l = b.match(/\(layer\s+"?([^)"]+)"?\)/);
    if (a && e && l) graphics.push({
      kind: "line",
      x1: +a[1],
      y1: +a[2],
      x2: +e[1],
      y2: +e[2],
      layer: l[1]
    });
  }
  for (const b of sexprBlocks(txt, "fp_circle")) {
    const c = b.match(/\(center\s+([-\d.]+)\s+([-\d.]+)\)/),
      e = b.match(/\(end\s+([-\d.]+)\s+([-\d.]+)\)/),
      l = b.match(/\(layer\s+"?([^)"]+)"?\)/);
    if (c && e && l) graphics.push({
      kind: "circle",
      cx: +c[1],
      cy: +c[2],
      ex: +e[1],
      ey: +e[2],
      layer: l[1]
    });
  }
  for (const b of sexprBlocks(txt, "fp_arc")) {
    const c = b.match(/\(start\s+([-\d.]+)\s+([-\d.]+)\)/),
      e = b.match(/\(end\s+([-\d.]+)\s+([-\d.]+)\)/),
      l = b.match(/\(layer\s+"?([^)"]+)"?\)/);
    if (c && e && l) graphics.push({
      kind: "line",
      x1: +c[1],
      y1: +c[2],
      x2: +e[1],
      y2: +e[2],
      layer: l[1]
    });
  }
  const pads = [];
  for (const b of sexprBlocks(txt, "pad")) {
    const head = b.match(/^\(pad\s+"?([^\s"]+)"?\s+(\S+)\s+(\S+)/),
      at = b.match(/\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\)/),
      sz = b.match(/\(size\s+([-\d.]+)\s+([-\d.]+)\)/);
    if (head && at && sz) pads.push({
      num: head[1],
      type: head[2],
      shape: head[3],
      x: +at[1],
      y: +at[2],
      rot: +(at[3] || 0),
      w: +sz[1],
      h: +sz[2]
    });
  }
  if (!graphics.length && !pads.length) {
    svg.innerHTML = "";
    return 0;
  }
  const pts = [];
  graphics.forEach(o => o.kind === "line" ? pts.push([o.x1, o.y1], [o.x2, o.y2]) : pts.push([o.cx, o.cy], [o.ex, o.ey]));
  pads.forEach(p => {
    const r = Math.hypot(p.w, p.h) / 2;
    pts.push([p.x - r, p.y - r], [p.x + r, p.y + r]);
  });
  let minX = -5,
    maxX = 5,
    minY = -4,
    maxY = 4;
  if (pts.length) {
    minX = Math.min(...pts.map(p => p[0]));
    maxX = Math.max(...pts.map(p => p[0]));
    minY = Math.min(...pts.map(p => p[1]));
    maxY = Math.max(...pts.map(p => p[1]));
  }
  const sc = Math.min((w - 90) / Math.max(maxX - minX, 1), (h - 80) / Math.max(maxY - minY, 1)),
    cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const g = mk("g", {
    transform: `translate(${w / 2} ${h / 2}) scale(${sc}) translate(${-cx} ${-cy})`
  });
  svg.appendChild(g);
  const style = l => l.includes("CrtYd") ? {
    s: "#db6a2b",
    d: "0.18 0.12",
    wd: .055
  } : l.includes("Silk") ? {
    s: "#d6b937",
    d: "",
    wd: .10
  } : l.includes("Fab") ? {
    s: "#6c7d93",
    d: "",
    wd: .055
  } : {
    s: "#9aa8b8",
    d: "",
    wd: .045
  };
  graphics.forEach(o => {
    const st = style(o.layer);
    const el = o.kind === "line" ? mk("line", {
      x1: o.x1,
      y1: o.y1,
      x2: o.x2,
      y2: o.y2
    }) : mk("circle", {
      cx: o.cx,
      cy: o.cy,
      r: Math.hypot(o.ex - o.cx, o.ey - o.cy)
    });
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", st.s);
    el.setAttribute("stroke-width", st.wd);
    if (st.d) el.setAttribute("stroke-dasharray", st.d);
    g.appendChild(el);
  });
  pads.forEach(p => {
    const sel = samePin(selectedPin, p.num);
    const pg = mk("g", {
      transform: `translate(${p.x} ${p.y}) rotate(${p.rot})`,
      style: "cursor:pointer"
    });
    const round = p.shape === "circle" || p.shape === "oval";
    const shape = round ? mk("ellipse", {
      cx: 0,
      cy: 0,
      rx: p.w / 2,
      ry: p.h / 2
    }) : mk("rect", {
      x: -p.w / 2,
      y: -p.h / 2,
      width: p.w,
      height: p.h,
      rx: p.shape.includes("round") ? .12 : 0
    });
    shape.setAttribute("fill", sel ? "#006cff" : p.num === "1" ? "#d77b31" : "#d69f36");
    shape.setAttribute("stroke", sel ? "#0047c7" : "#8c6419");
    shape.setAttribute("stroke-width", sel ? ".22" : ".04");
    if (sel) {
      const halo = mk("rect", {
        x: -p.w / 2 - .22,
        y: -p.h / 2 - .22,
        width: p.w + .44,
        height: p.h + .44,
        rx: .15,
        fill: "none",
        stroke: "#0047c7",
        "stroke-width": ".08",
        "stroke-dasharray": ".18 .12"
      });
      pg.appendChild(halo);
    }
    pg.appendChild(shape);
    const t = mk("text", {
      x: 0,
      y: 0,
      transform: `rotate(${-p.rot})`,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": Math.max(.28, Math.min(p.w, p.h) * .42),
      fill: "#fff",
      "font-family": "Arial",
      "font-weight": sel ? "900" : "700"
    });
    t.textContent = p.num;
    pg.appendChild(t);
    if (onPinClick) {
      pg.setAttribute("role", "button");
      pg.setAttribute("tabindex", "0");
      pg.setAttribute("aria-label", `焊盘 ${p.num}`);
      const fire = e => {
        e.stopPropagation();
        onPinClick(normPin(p.num));
      };
      pg.addEventListener("click", fire);
      pg.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") fire(e);
      });
    }
    g.appendChild(pg);
  });
  const legend = mk("g", {
    transform: `translate(22 ${h - 22})`
  });
  [["#d6b937", "F.SilkS"], ["#db6a2b", "F.CrtYd"], ["#6c7d93", "F.Fab"], ["#d77b31", "Pin 1"]].forEach((it, i) => {
    legend.appendChild(mk("line", {
      x1: i * 95,
      y1: 0,
      x2: i * 95 + 18,
      y2: 0,
      stroke: it[0],
      "stroke-width": 3
    }));
    const t = mk("text", {
      x: i * 95 + 23,
      y: 5,
      fill: "#54657c",
      "font-size": 12
    });
    t.textContent = it[1];
    legend.appendChild(t);
  });
  svg.appendChild(legend);
  return pads.length;
}

// ── 符号：现代 .kicad_sym → legacy 中间格式 ──
function tokenizeSexpr(text) {
  const t = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      t.push(c);
      i++;
      continue;
    }
    if (c === '"') {
      let out = "",
        esc = false;
      i++;
      while (i < text.length) {
        const ch = text[i++];
        if (esc) {
          out += ch;
          esc = false;
        } else if (ch === "\\") esc = true;else if (ch === '"') break;else out += ch;
      }
      t.push({
        quoted: true,
        value: out
      });
      continue;
    }
    let j = i;
    while (j < text.length && !/[\s()]/.test(text[j])) j++;
    t.push(text.slice(i, j));
    i = j;
  }
  return t;
}
function parseSexpr(text) {
  const tk = tokenizeSexpr(text);
  let i = 0;
  function p() {
    if (tk[i] !== "(") return tk[i++];
    i++;
    const o = [];
    while (i < tk.length && tk[i] !== ")") o.push(p());
    i++;
    return o;
  }
  return p();
}
const atom = n => n && typeof n === "object" && n.quoted ? n.value : String(n ?? "");
const childOf = (n, k) => Array.isArray(n) ? n.find(x => Array.isArray(x) && atom(x[0]) === k) : undefined;
const childrenOf = (n, k) => Array.isArray(n) ? n.filter(x => Array.isArray(x) && atom(x[0]) === k) : [];
const xyOf = (n, k) => {
  const c = childOf(n, k);
  return c ? [Number(atom(c[1])) || 0, Number(atom(c[2])) || 0] : [0, 0];
};
function modernSymbolToLegacy(text, wantName) {
  if (!text.includes("(kicad_symbol_lib")) return "";
  let root;
  try {
    root = parseSexpr(text);
  } catch {
    return "";
  }
  const avail = childrenOf(root, "symbol");
  const want = String(wantName || "").toLowerCase();
  const outer = avail.find(n => atom(n[1]).toLowerCase() === want) || avail.find(n => atom(n[1]).toLowerCase().endsWith(`:${want}`)) || avail[0];
  if (!outer) return "";
  const name = atom(outer[1]) || wantName || "PART";
  const nested = childrenOf(outer, "symbol");
  const S = 39.3700787,
    n = v => Math.round(Number(v || 0) * S);
  const ang2ori = a => {
    const x = (((Number(a) || 0) + 180) % 360 + 360) % 360;
    return x === 0 ? "L" : x === 90 ? "D" : x === 180 ? "R" : "U";
  };
  const lines = [`DEF ${name.replace(/\s+/g, "_")} U 0 20 Y Y 1 F N`, "DRAW"];
  const add = (node, unit) => {
    for (const it of node.slice(2)) {
      if (!Array.isArray(it)) continue;
      const k = atom(it[0]);
      if (k === "rectangle") {
        const [x1, y1] = xyOf(it, "start"),
          [x2, y2] = xyOf(it, "end");
        const ft = atom(childOf(childOf(it, "fill") || [], "type")?.[1]);
        lines.push(`S ${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${unit} 1 10 ${ft === "background" || ft === "color" ? "f" : "N"}`);
      } else if (k === "polyline") {
        const pn = childOf(it, "pts"),
          pts = pn ? childrenOf(pn, "xy") : [];
        if (pts.length) lines.push(`P ${pts.length} ${unit} 1 10 ${pts.map(p => `${n(atom(p[1]))} ${n(atom(p[2]))}`).join(" ")} N`);
      } else if (k === "circle") {
        const [cx, cy] = xyOf(it, "center");
        lines.push(`C ${n(cx)} ${n(cy)} ${n(Number(atom(childOf(it, "radius")?.[1])) || 0)} ${unit} 1 10 N`);
      } else if (k === "pin") {
        const at = childOf(it, "at") || [];
        const x = Number(atom(at[1])) || 0,
          y = Number(atom(at[2])) || 0,
          a = ((Number(atom(at[3])) || 0) % 360 + 360) % 360;
        const len = Number(atom(childOf(it, "length")?.[1])) || 2.54;
        const nm = atom(childOf(it, "name")?.[1]) || "~",
          num = atom(childOf(it, "number")?.[1]) || "~";
        lines.push(`X ${nm.replace(/\s+/g, "_")} ${num} ${n(x)} ${n(y)} ${n(len)} ${ang2ori(a)} 50 50 ${unit} 1 P`);
      }
    }
  };
  if (nested.length) {
    let mu = 1;
    for (const un of nested) {
      const m = atom(un?.[1]).match(/_(\d+)_(\d+)$/);
      const u = m ? Number(m[1]) : 0;
      mu = Math.max(mu, u || 1);
      add(un, u || 0);
    }
    lines[0] = `DEF ${name.replace(/\s+/g, "_")} U 0 20 Y Y ${mu} F N`;
  } else add(outer, 1);
  lines.push("ENDDRAW", "ENDDEF");
  return lines.join("\n");
}
function extractLegacySymbol(lib, name) {
  if (!name) return "";
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return lib.match(new RegExp(`DEF\\s+${esc}\\s+[\\s\\S]*?ENDDEF`))?.[0] || "";
}
// 无符号文件时合成符号（输出与 parseKicadSym 相同的结构，走同一渲染器，样式一致）
// 单位 mm，遵循 KiCad 惯例：2.54mm 引脚间距、引脚长 2.54mm、体宽随引脚名长度自适应
function synthSymbol(partNumber, pinCount, pinNames) {
  const count = Math.max(2, pinCount || 8);
  const left = Math.ceil(count / 2),
    right = count - left;
  const rows = Math.max(left, right);
  const pitch = 2.54,
    len = 2.54;
  const halfH = Math.max(5.08, (rows - 1) * pitch / 2 + 2.54);
  const maxName = Math.max(4, ...(pinNames || []).map(x => String(x || "").length));
  const halfW = Math.max(6.35, Math.min(25.4, maxName * 1.3 + 3.81));
  const shapes = [{
    kind: "rect",
    x1: -halfW,
    y1: halfH,
    x2: halfW,
    y2: -halfH,
    filled: true
  }];
  const pins = [];
  const nm = i => {
    const v = pinNames && pinNames[i];
    return v && String(v).trim() ? String(v).trim() : "~";
  };
  // 无引脚名时保持 "~"（渲染器会隐藏），避免用编号冒充名称造成误解
  for (let i = 0; i < left; i++) {
    const y = left === 1 ? 0 : (rows - 1) * pitch / 2 - i * pitch;
    pins.push({
      x: -halfW - len,
      y,
      angle: 0,
      length: len,
      name: nm(i),
      number: String(i + 1)
    }); // angle 0 = 向右指入体
  }
  for (let i = 0; i < right; i++) {
    const y = right === 1 ? 0 : -(rows - 1) * pitch / 2 + i * pitch;
    pins.push({
      x: halfW + len,
      y,
      angle: 180,
      length: len,
      name: nm(left + i),
      number: String(left + i + 1)
    });
  }
  return {
    name: partNumber || "PART",
    shapes,
    pins,
    skipped: 0,
    _synth: true
  };
}
// ── 符号渲染 ──
function renderSymbolToSvg(txt, svg, unit, onPinClick, selectedPin) {
  svg.innerHTML = "";
  const vb = svg.viewBox?.baseVal,
    w = vb?.width || 800,
    h = vb?.height || 520;
  // 先扫描内容范围，自适应缩放（引脚多时自动缩小，保证全部可见）
  let bx = 200,
    by = 200;
  {
    let ind = false;
    for (const l of txt.split(/\r?\n/)) {
      if (l.trim() === "DRAW") {
        ind = true;
        continue;
      }
      if (l.trim() === "ENDDRAW") break;
      if (!ind) continue;
      const q = l.trim().split(/\s+/);
      if (q[0] === "S") {
        bx = Math.max(bx, Math.abs(+q[1]), Math.abs(+q[3]));
        by = Math.max(by, Math.abs(+q[2]), Math.abs(+q[4]));
      } else if (q[0] === "X") {
        const x = +q[3],
          y = +q[4],
          len = +q[5];
        bx = Math.max(bx, Math.abs(x) + len * 0.2);
        by = Math.max(by, Math.abs(y) + 60);
      }
    }
  }
  const scale = Math.min(w * 0.42 / bx, h * 0.42 / by);
  const mk = (t, a = {}) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", t);
    Object.entries(a).forEach(([k, v]) => v != null && e.setAttribute(k, v));
    return e;
  };
  const g = mk("g", {
      transform: `translate(${w / 2} ${h / 2}) scale(${scale} ${-scale})`
    }),
    tl = mk("g", {});
  svg.appendChild(g);
  svg.appendChild(tl);
  const toScreen = (x, y) => ({
    x: w / 2 + x * scale,
    y: h / 2 - y * scale
  });
  let inDraw = false,
    count = 0;
  for (const l of txt.split(/\r?\n/)) {
    if (l.trim() === "DRAW") {
      inDraw = true;
      continue;
    }
    if (l.trim() === "ENDDRAW") break;
    if (!inDraw) continue;
    const p = l.trim().split(/\s+/);
    if (!p.length) continue;
    const ui = {
      S: 5,
      P: 2,
      C: 4,
      A: 6,
      X: 9
    }[p[0]];
    const iu = ui == null ? 0 : +p[ui] || 0;
    if (iu !== 0 && iu !== unit) continue;
    if (p[0] === "S") {
      const [x1, y1, x2, y2] = p.slice(1, 5).map(Number);
      g.appendChild(mk("rect", {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        fill: p[p.length - 1]?.toLowerCase() === "f" ? "#fffdb5" : "none",
        stroke: "#a40000",
        "stroke-width": 10
      }));
    } else if (p[0] === "P") {
      const k = +p[1],
        off = 5,
        pts = [];
      for (let i = 0; i < k; i++) pts.push(`${p[off + i * 2]},${p[off + i * 2 + 1]}`);
      g.appendChild(mk("polyline", {
        points: pts.join(" "),
        fill: p[p.length - 1] === "F" ? "#fffdb5" : "none",
        stroke: "#a40000",
        "stroke-width": 10,
        "stroke-linejoin": "round"
      }));
    } else if (p[0] === "C") {
      g.appendChild(mk("circle", {
        cx: p[1],
        cy: p[2],
        r: p[3],
        fill: "none",
        stroke: "#a40000",
        "stroke-width": 10
      }));
    } else if (p[0] === "X") {
      count++;
      const name = p[1],
        num = p[2],
        x = +p[3],
        y = +p[4],
        len = +p[5],
        ori = p[6];
      let x2 = x,
        y2 = y;
      if (ori === "R") x2 += len;
      if (ori === "L") x2 -= len;
      if (ori === "U") y2 += len;
      if (ori === "D") y2 -= len;
      const sel = samePin(selectedPin, num);
      const col = sel ? "#006cff" : "#a40000";
      const pg = mk("g", {
        style: "cursor:pointer"
      });
      pg.appendChild(mk("line", {
        x1: x,
        y1: y,
        x2,
        y2,
        stroke: "transparent",
        "stroke-width": 34
      }));
      pg.appendChild(mk("line", {
        x1: x,
        y1: y,
        x2,
        y2,
        stroke: col,
        "stroke-width": (sel ? 13 : 8) * Math.max(1, 0.5 / scale)
      }));
      pg.appendChild(mk("circle", {
        cx: x,
        cy: y,
        r: 11,
        fill: "none",
        stroke: col,
        "stroke-width": 3
      }));
      if (onPinClick) pg.addEventListener("click", e => {
        e.stopPropagation();
        onPinClick(num);
      });
      g.appendChild(pg);
      const outer = toScreen(x, y),
        inner = toScreen(x2, y2);
      const dx = inner.x - outer.x,
        dy = inner.y - outer.y,
        dist = Math.hypot(dx, dy) || 1,
        ux = dx / dist,
        uy = dy / dist;
      const mkT = (text, pos, size, {
        anchor = "middle",
        rotation = 0,
        color = "#006b68",
        weight = "500"
      } = {}) => {
        const t = mk("text", {
          x: pos.x,
          y: pos.y,
          transform: rotation ? `rotate(${rotation} ${pos.x} ${pos.y})` : null,
          fill: color,
          "font-size": size,
          "font-family": "Arial",
          "font-weight": weight,
          "text-anchor": anchor,
          "dominant-baseline": "middle",
          "paint-order": "stroke",
          stroke: "#fffdb5",
          "stroke-width": "2.5"
        });
        t.textContent = text;
        tl.appendChild(t);
      };
      const vert = ori === "U" || ori === "D",
        noff = vert ? 42 : 18;
      const nameAt = {
        x: inner.x + ux * noff,
        y: inner.y + uy * noff
      };
      let na = "middle",
        nr = 0;
      if (ori === "R") na = "start";else if (ori === "L") na = "end";else nr = -90;
      const base = {
        x: outer.x + ux * 16,
        y: outer.y + uy * 16
      };
      const numAt = Math.abs(dx) >= Math.abs(dy) ? {
        x: base.x,
        y: base.y - 17
      } : {
        x: base.x - 13,
        y: base.y
      };
      const fs = Math.max(9, Math.min(26, scale * 38));
      if (name && name !== "~") mkT(name, nameAt, fs, {
        anchor: na,
        rotation: nr,
        color: sel ? "#006cff" : "#006b68",
        weight: sel ? "800" : "500"
      });
      if (num && num !== "~") mkT(num, numAt, fs * 0.88, {
        anchor: Math.abs(dx) >= Math.abs(dy) ? "middle" : "end",
        color: sel ? "#006cff" : "#a40000",
        weight: sel ? "800" : "500"
      });
    }
  }
  return count;
}

// ── .kicad_sym 原生解析与渲染（移植自 ezplm-smt-scm）──
// 纪律：只画能确定解析的图元；跳过的如实计数并在 UI 说明，不假装画全了
function parseKicadSym(src) {
  const root = parseSexpr(src);
  const tops = childrenOf(root, "symbol");
  const top = tops[0];
  if (!top) throw new Error("未找到 symbol 定义");
  const name = atom(top[1]) || "(未命名符号)";
  const shapes = [],
    pins = [];
  let skipped = 0;
  const fillSolid = n => {
    const f = childOf(n, "fill");
    const t = f ? atom(childOf(f, "type")?.[1]) : null;
    return t === "outline" || t === "color";
  };
  const XY = n => {
    const c = childOf(n, "at") || n;
    return c ? {
      x: Number(atom(c[1])) || 0,
      y: Number(atom(c[2])) || 0,
      angle: Number(atom(c[3])) || 0
    } : null;
  };
  const pt = (n, k) => {
    const c = childOf(n, k);
    return c ? {
      x: Number(atom(c[1])) || 0,
      y: Number(atom(c[2])) || 0
    } : null;
  };
  // KiCad 子符号命名: NAME_<unit>_<style>，unit=0 表示所有单元共用
  const subs = childrenOf(top, "symbol");
  const units = [[top, 0], ...subs.map(u => {
    const m = String(atom(u?.[1]) || "").match(/_(\d+)_(\d+)$/);
    return [u, m ? Number(m[1]) : 0];
  })];
  let maxUnit = 1;
  for (const [unit, uno] of units) {
    maxUnit = Math.max(maxUnit, uno || 1);
    for (const item of Array.isArray(unit) ? unit.slice(2) : []) {
      if (!Array.isArray(item)) continue;
      const h = atom(item[0]);
      if (h === "rectangle") {
        const s = pt(item, "start"),
          e = pt(item, "end");
        if (s && e) shapes.push({
          unit: uno,
          kind: "rect",
          x1: s.x,
          y1: s.y,
          x2: e.x,
          y2: e.y,
          filled: fillSolid(item)
        });else skipped++;
      } else if (h === "circle") {
        const c = pt(item, "center"),
          r = Number(atom(childOf(item, "radius")?.[1]));
        if (c && !isNaN(r)) shapes.push({
          unit: uno,
          kind: "circle",
          cx: c.x,
          cy: c.y,
          r,
          filled: fillSolid(item)
        });else skipped++;
      } else if (h === "polyline") {
        const ps = childOf(item, "pts");
        const points = ps ? childrenOf(ps, "xy").map(p => ({
          x: Number(atom(p[1])) || 0,
          y: Number(atom(p[2])) || 0
        })) : [];
        if (points.length >= 2) shapes.push({
          unit: uno,
          kind: "polyline",
          points,
          filled: fillSolid(item)
        });else skipped++;
      } else if (h === "arc") {
        const s = pt(item, "start"),
          m = pt(item, "mid"),
          e = pt(item, "end");
        if (s && m && e) shapes.push({
          unit: uno,
          kind: "arc",
          start: s,
          mid: m,
          end: e
        });else skipped++;
      } else if (h === "pin") {
        const at = childOf(item, "at"),
          len = Number(atom(childOf(item, "length")?.[1]));
        if (!at || isNaN(len)) {
          skipped++;
          continue;
        }
        pins.push({
          unit: uno,
          x: Number(atom(at[1])) || 0,
          y: Number(atom(at[2])) || 0,
          angle: Number(atom(at[3])) || 0,
          length: len,
          name: atom(childOf(item, "name")?.[1]) || "",
          number: atom(childOf(item, "number")?.[1]) || ""
        });
      }
    }
  }
  if (!shapes.length && !pins.length) throw new Error("符号中没有可渲染的图形或引脚");
  // 单元标签：仅含电源引脚的单元标注为"电源单元"
  const unitLabels = {};
  for (let u = 1; u <= maxUnit; u++) {
    const up = pins.filter(p => p.unit === u);
    const isPwr = up.length > 0 && up.every(p => /^(v\+|v-|vcc|vdd|vss|vee|gnd|vs\+|vs-)$/i.test(String(p.name).trim()));
    unitLabels[u] = `${String.fromCharCode(64 + u)} · ${isPwr ? "电源单元" : "单元 " + String.fromCharCode(64 + u)}`;
  }
  return {
    name,
    shapes,
    pins,
    skipped,
    maxUnit,
    unitLabels
  };
}

// 渲染 .kicad_sym 到 SVG DOM（mm 单位，Y 轴翻转）
function renderKicadSymTo(sym, svg, onPinClick, selPin, unit = 1) {
  svg.innerHTML = "";
  const inU = o => !o.unit || o.unit === 0 || o.unit === unit; // unit 0 = 所有单元共用
  const shapes = (sym.shapes || []).filter(inU),
    pins = (sym.pins || []).filter(inU);
  const b = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  const add = (x, y) => {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  };
  for (const s of shapes) {
    if (s.kind === "rect") {
      add(s.x1, s.y1);
      add(s.x2, s.y2);
    } else if (s.kind === "circle") {
      add(s.cx - s.r, s.cy - s.r);
      add(s.cx + s.r, s.cy + s.r);
    } else if (s.kind === "polyline") {
      for (const p of s.points) add(p.x, p.y);
    } else {
      add(s.start.x, s.start.y);
      add(s.mid.x, s.mid.y);
      add(s.end.x, s.end.y);
    }
  }
  for (const p of pins) {
    add(p.x, p.y);
    const r = p.angle * Math.PI / 180;
    add(p.x + p.length * Math.cos(r), p.y + p.length * Math.sin(r));
  }
  if (!isFinite(b.minX)) {
    b.minX = -10;
    b.maxX = 10;
    b.minY = -10;
    b.maxY = 10;
  }
  const pad = 6,
    minX = b.minX - pad,
    maxX = b.maxX + pad,
    minY = -b.maxY - pad,
    maxY = -b.minY + pad;
  svg.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
  const mk = (t, a = {}) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", t);
    Object.entries(a).forEach(([k, v]) => v != null && e.setAttribute(k, v));
    return e;
  };
  const g = mk("g", {
    "data-zoom-layer": "1"
  });
  svg.appendChild(g);
  const SK = "#a40000",
    FILL = "#fffdb5",
    W = .254;
  for (const s of shapes) {
    let el;
    if (s.kind === "rect") el = mk("rect", {
      x: Math.min(s.x1, s.x2),
      y: -Math.max(s.y1, s.y2),
      width: Math.abs(s.x2 - s.x1),
      height: Math.abs(s.y2 - s.y1),
      fill: FILL
    });else if (s.kind === "circle") el = mk("circle", {
      cx: s.cx,
      cy: -s.cy,
      r: s.r,
      fill: s.filled ? FILL : "none"
    });else if (s.kind === "polyline") el = mk("polyline", {
      points: s.points.map(p => `${p.x},${-p.y}`).join(" "),
      fill: s.filled ? FILL : "none"
    });else {
      const cx = 2 * s.mid.x - (s.start.x + s.end.x) / 2,
        cy = 2 * s.mid.y - (s.start.y + s.end.y) / 2;
      el = mk("path", {
        d: `M ${s.start.x} ${-s.start.y} Q ${cx} ${-cy} ${s.end.x} ${-s.end.y}`,
        fill: "none"
      });
    }
    el.setAttribute("stroke", SK);
    el.setAttribute("stroke-width", W);
    el.setAttribute("stroke-linecap", "round");
    g.appendChild(el);
  }
  for (const p of pins) {
    const r = p.angle * Math.PI / 180,
      ex = p.x + p.length * Math.cos(r),
      ey = p.y + p.length * Math.sin(r);
    const sel = samePin(selPin, p.number);
    const col = sel ? "#006cff" : SK;
    const pg = mk("g", {
      style: "cursor:pointer"
    });
    pg.appendChild(mk("line", {
      x1: p.x,
      y1: -p.y,
      x2: ex,
      y2: -ey,
      stroke: "transparent",
      "stroke-width": 1.2
    }));
    pg.appendChild(mk("line", {
      x1: p.x,
      y1: -p.y,
      x2: ex,
      y2: -ey,
      stroke: col,
      "stroke-width": sel ? W * 4 : W
    }));
    pg.appendChild(mk("circle", {
      cx: p.x,
      cy: -p.y,
      r: sel ? .6 : .35,
      fill: col
    }));
    if (sel) pg.appendChild(mk("circle", {
      cx: p.x,
      cy: -p.y,
      r: 1.1,
      fill: "none",
      stroke: "#0047c7",
      "stroke-width": .18
    }));
    if (onPinClick && p.number) {
      pg.setAttribute("role", "button");
      pg.setAttribute("tabindex", "0");
      pg.setAttribute("aria-label", `引脚 ${p.number}${p.name && p.name !== "~" ? " " + p.name : ""}`);
      const fire = e => {
        e.stopPropagation();
        onPinClick(normPin(p.number));
      };
      pg.addEventListener("click", fire);
      pg.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") fire(e);
      });
    }
    g.appendChild(pg);
    const inX = Math.cos(r),
      inY = -Math.sin(r),
      vert = Math.abs(inY) > Math.abs(inX);
    if (p.number) {
      const mx = (p.x + ex) / 2,
        my = -(p.y + ey) / 2;
      const t = vert ? mk("text", {
        x: mx - .35,
        y: my,
        "font-size": 1,
        "text-anchor": "middle",
        fill: sel ? "#006cff" : "#7a8a80",
        transform: `rotate(-90 ${mx - .35} ${my})`
      }) : mk("text", {
        x: mx,
        y: my - .45,
        "font-size": 1,
        "text-anchor": "middle",
        fill: sel ? "#006cff" : "#7a8a80"
      });
      t.textContent = p.number;
      g.appendChild(t);
    }
    if (p.name && p.name !== "~") {
      const nx = ex + inX * .8,
        ny = -ey + inY * .8;
      const anchor = vert ? inY > 0 ? "end" : "start" : inX > 0 ? "start" : "end";
      const t = vert ? mk("text", {
        x: nx,
        y: ny + .4,
        "font-size": 1.15,
        "text-anchor": anchor,
        fill: sel ? "#006cff" : "#1a2e23",
        transform: `rotate(-90 ${nx} ${ny + .4})`
      }) : mk("text", {
        x: nx,
        y: ny + .4,
        "font-size": 1.15,
        "text-anchor": anchor,
        fill: sel ? "#006cff" : "#1a2e23"
      });
      t.textContent = p.name;
      g.appendChild(t);
    }
  }
  return pins.length;
}

// ── 按品类生成标准 eCAD 符号 ──
// 电阻/电容/电感/二极管等的原理图符号是 IEC/IEEE 标准化图形，
// 依品类生成是"准确"而非"猜测"；IC 类只能按引脚数生成矩形，属于示意。
function detectSymbolKind(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(resistor|res\b)|电阻/.test(t) && !/网络|array|排阻/.test(t)) return "R";
  if (/capacitor|电容/.test(t)) return /电解|polarized|tantalum|钽|aluminum/.test(t) ? "CP" : "C";
  if (/inductor|电感|磁珠|ferrite bead/.test(t)) return "L";
  if (/\bled\b|发光二极管/.test(t)) return "LED";
  if (/zener|稳压二极管/.test(t)) return "DZ";
  if (/schottky|肖特基/.test(t)) return "DS";
  if (/diode|二极管|整流/.test(t)) return "D";
  if (/crystal|晶振|谐振/.test(t)) return "XTAL";
  if (/fuse|保险丝|熔断/.test(t)) return "F";
  if (/mosfet|场效应/.test(t)) return /p-?channel|pmos|p沟道/.test(t) ? "PMOS" : "NMOS";
  if (/\bbjt\b|三极管|bipolar transistor/.test(t)) return /\bpnp\b/.test(t) ? "PNP" : "NPN";
  if (/operational amplifier|运算放大器|运放|op-?amp|variable gain amplifier|可变增益/.test(t)) return "OPAMP";
  return null;
}

// 生成 parseKicadSym 兼容结构（mm 单位，KiCad 惯例）
function standardSymbol(kind, partNumber) {
  const S = {
    name: partNumber || kind,
    shapes: [],
    pins: [],
    skipped: 0,
    maxUnit: 1,
    unitLabels: {
      1: "A · 单元 A"
    },
    _std: kind
  };
  const P = (n, num, x, y, ang, len = 2.54) => S.pins.push({
    unit: 1,
    x,
    y,
    angle: ang,
    length: len,
    name: n,
    number: String(num)
  });
  const line = pts => S.shapes.push({
    unit: 1,
    kind: "polyline",
    points: pts,
    filled: false
  });
  const rect = (x1, y1, x2, y2, f) => S.shapes.push({
    unit: 1,
    kind: "rect",
    x1,
    y1,
    x2,
    y2,
    filled: !!f
  });
  const tri = (a, b, c, f) => S.shapes.push({
    unit: 1,
    kind: "polyline",
    points: [a, b, c, a],
    filled: !!f
  });
  switch (kind) {
    case "R":
      rect(-1.016, 2.54, 1.016, -2.54, false);
      P("~", 1, 0, 5.08, 270);
      P("~", 2, 0, -5.08, 90);
      break;
    case "C":
      line([{
        x: -2.54,
        y: 0.508
      }, {
        x: 2.54,
        y: 0.508
      }]);
      line([{
        x: -2.54,
        y: -0.508
      }, {
        x: 2.54,
        y: -0.508
      }]);
      P("~", 1, 0, 3.81, 270, 3.302);
      P("~", 2, 0, -3.81, 90, 3.302);
      break;
    case "CP":
      line([{
        x: -2.54,
        y: 0.508
      }, {
        x: 2.54,
        y: 0.508
      }]);
      S.shapes.push({
        unit: 1,
        kind: "arc",
        start: {
          x: -2.54,
          y: -1.27
        },
        mid: {
          x: 0,
          y: -0.508
        },
        end: {
          x: 2.54,
          y: -1.27
        }
      });
      line([{
        x: -1.7,
        y: 2.2
      }, {
        x: -0.7,
        y: 2.2
      }]);
      line([{
        x: -1.2,
        y: 1.7
      }, {
        x: -1.2,
        y: 2.7
      }]); // "+" 标记
      P("+", 1, 0, 3.81, 270, 3.302);
      P("-", 2, 0, -3.81, 90, 3.302);
      break;
    case "L":
      for (let i = 0; i < 4; i++) S.shapes.push({
        unit: 1,
        kind: "arc",
        start: {
          x: 0,
          y: 2.54 - i * 1.27
        },
        mid: {
          x: 0.8,
          y: 1.905 - i * 1.27
        },
        end: {
          x: 0,
          y: 1.27 - i * 1.27
        }
      });
      P("~", 1, 0, 5.08, 270);
      P("~", 2, 0, -5.08, 90);
      break;
    case "D":
    case "DZ":
    case "DS":
    case "LED":
      tri({
        x: -1.27,
        y: 1.27
      }, {
        x: -1.27,
        y: -1.27
      }, {
        x: 1.27,
        y: 0
      }, true);
      if (kind === "DZ") line([{
        x: 1.27,
        y: 1.27
      }, {
        x: 1.27,
        y: -1.27
      }, {
        x: 1.9,
        y: -1.9
      }]);else if (kind === "DS") line([{
        x: 1.9,
        y: 1.9
      }, {
        x: 1.27,
        y: 1.27
      }, {
        x: 1.27,
        y: -1.27
      }, {
        x: 0.64,
        y: -1.9
      }]);else line([{
        x: 1.27,
        y: 1.27
      }, {
        x: 1.27,
        y: -1.27
      }]);
      if (kind === "LED") {
        line([{
          x: 1.8,
          y: 2.2
        }, {
          x: 3.2,
          y: 3.6
        }]);
        line([{
          x: 2.6,
          y: 2.2
        }, {
          x: 4.0,
          y: 3.6
        }]);
      }
      P("K", 1, -3.81, 0, 0);
      P("A", 2, 3.81, 0, 180);
      break;
    case "XTAL":
      rect(-0.762, 1.905, 0.762, -1.905, false);
      line([{
        x: -1.778,
        y: 1.905
      }, {
        x: -1.778,
        y: -1.905
      }]);
      line([{
        x: 1.778,
        y: 1.905
      }, {
        x: 1.778,
        y: -1.905
      }]);
      P("1", 1, -3.81, 0, 0, 2.032);
      P("2", 2, 3.81, 0, 180, 2.032);
      break;
    case "F":
      rect(-2.54, 1.016, 2.54, -1.016, false);
      line([{
        x: -2.54,
        y: 0
      }, {
        x: 2.54,
        y: 0
      }]);
      P("~", 1, -5.08, 0, 0);
      P("~", 2, 5.08, 0, 180);
      break;
    case "NPN":
    case "PNP":
      line([{
        x: 0,
        y: 2.54
      }, {
        x: 0,
        y: -2.54
      }]); // 基极竖线
      line([{
        x: 0,
        y: 1.27
      }, {
        x: 2.54,
        y: 2.54
      }]);
      line([{
        x: 0,
        y: -1.27
      }, {
        x: 2.54,
        y: -2.54
      }]);
      S.shapes.push({
        unit: 1,
        kind: "polyline",
        filled: true,
        points: kind === "NPN" ? [{
          x: 1.5,
          y: -1.6
        }, {
          x: 2.2,
          y: -2.3
        }, {
          x: 1.2,
          y: -2.4
        }, {
          x: 1.5,
          y: -1.6
        }] : [{
          x: 0.5,
          y: -1.9
        }, {
          x: 1.4,
          y: -1.5
        }, {
          x: 1.2,
          y: -2.5
        }, {
          x: 0.5,
          y: -1.9
        }]
      });
      P("B", 1, -2.54, 0, 0);
      P("C", 2, 2.54, 5.08, 270, 2.54);
      P("E", 3, 2.54, -5.08, 90, 2.54);
      break;
    case "NMOS":
    case "PMOS":
      line([{
        x: -1.27,
        y: 2.54
      }, {
        x: -1.27,
        y: -2.54
      }]); // 栅极
      line([{
        x: 0,
        y: 2.54
      }, {
        x: 0,
        y: 1.27
      }]);
      line([{
        x: 0,
        y: 0.635
      }, {
        x: 0,
        y: -0.635
      }]);
      line([{
        x: 0,
        y: -1.27
      }, {
        x: 0,
        y: -2.54
      }]);
      line([{
        x: 0,
        y: 1.905
      }, {
        x: 2.54,
        y: 1.905
      }, {
        x: 2.54,
        y: 5.08
      }]);
      line([{
        x: 0,
        y: -1.905
      }, {
        x: 2.54,
        y: -1.905
      }, {
        x: 2.54,
        y: -5.08
      }]);
      S.shapes.push({
        unit: 1,
        kind: "polyline",
        filled: true,
        points: kind === "NMOS" ? [{
          x: 1.0,
          y: 0
        }, {
          x: 0.2,
          y: 0.6
        }, {
          x: 0.2,
          y: -0.6
        }, {
          x: 1.0,
          y: 0
        }] : [{
          x: 0.2,
          y: 0
        }, {
          x: 1.0,
          y: 0.6
        }, {
          x: 1.0,
          y: -0.6
        }, {
          x: 0.2,
          y: 0
        }]
      });
      P("G", 1, -3.81, 0, 0);
      P("D", 2, 2.54, 7.62, 270, 2.54);
      P("S", 3, 2.54, -7.62, 90, 2.54);
      break;
    case "OPAMP":
      tri({
        x: -5.08,
        y: 5.08
      }, {
        x: -5.08,
        y: -5.08
      }, {
        x: 5.08,
        y: 0
      }, true);
      P("+", 3, -7.62, 2.54, 0);
      P("-", 2, -7.62, -2.54, 0);
      P("~", 1, 7.62, 0, 180);
      P("V+", 8, 0, 7.62, 270, 2.54);
      P("V-", 4, 0, -7.62, 90, 2.54);
      break;
    default:
      return null;
  }
  return S;
}

// 用 PDF 数据手册提取的引脚构建符号（引脚名与类型来自 datasheet）
function symbolFromPdfPins(partNumber, pdfPins) {
  const list = (pdfPins || []).filter(p => p && p.number);
  if (list.length < 2) return null;
  const isNC = p => p.type === "no_connect" || /^n\.?c\.?$|^nc\d*$/i.test(p.name || "");
  const isPwr = p => p.type === "power" && !isNC(p);
  const isIn = p => p.type === "input" && !isNC(p);
  const isOut = p => p.type === "output" && !isNC(p);
  // KiCad 惯例：输入在左，输出在右，电源上下；NC 集中排在左侧末尾，不与信号脚混排
  const nc = list.filter(isNC);
  const sig = list.filter(p => !isNC(p));
  const left = [...sig.filter(p => isIn(p) || !isOut(p) && !isPwr(p)), ...nc];
  const right = sig.filter(isOut);
  const pwr = sig.filter(isPwr);
  const rows = Math.max(left.length, right.length, 1);
  const pitch = 2.54,
    len = 2.54;
  const halfH = Math.max(5.08, (rows - 1) * pitch / 2 + 2.54);
  const maxName = Math.max(4, ...list.map(p => String(p.name || "").length));
  const halfW = Math.max(7.62, Math.min(30.48, maxName * 1.4 + 5.08));
  const S = {
    name: partNumber,
    shapes: [{
      unit: 1,
      kind: "rect",
      x1: -halfW,
      y1: halfH,
      x2: halfW,
      y2: -halfH,
      filled: true
    }],
    pins: [],
    skipped: 0,
    maxUnit: 1,
    unitLabels: {
      1: "A · 单元 A"
    },
    _pdf: true
  };
  left.forEach((p, i) => {
    const y = left.length === 1 ? 0 : (left.length - 1) * pitch / 2 - i * pitch;
    S.pins.push({
      unit: 1,
      x: -halfW - len,
      y,
      angle: 0,
      length: len,
      name: p.name || "~",
      number: String(p.number),
      type: p.type
    });
  });
  right.forEach((p, i) => {
    const y = right.length === 1 ? 0 : (right.length - 1) * pitch / 2 - i * pitch;
    S.pins.push({
      unit: 1,
      x: halfW + len,
      y,
      angle: 180,
      length: len,
      name: p.name || "~",
      number: String(p.number),
      type: p.type
    });
  });
  pwr.forEach((p, i) => {
    const half = Math.ceil(pwr.length / 2);
    const top = i < half,
      k = top ? i : i - half,
      cnt = top ? half : pwr.length - half;
    const x = cnt === 1 ? 0 : -(cnt - 1) * pitch / 2 + k * pitch;
    S.pins.push({
      unit: 1,
      x,
      y: top ? halfH + len : -halfH - len,
      angle: top ? 270 : 90,
      length: len,
      name: p.name || "~",
      number: String(p.number),
      type: p.type
    });
  });
  return S;
}

// ── 导出为 KiCad .kicad_sym（KiCad 7/8/9 通用 S-expression 格式）──
// 格式依据 KLC 与 kicad_sym 规范；生成的符号可直接加入 KiCad 9 符号库使用。
function pinTypeToKicad(t) {
  return {
    input: "input",
    output: "output",
    bidirectional: "bidirectional",
    power: "power_in",
    passive: "passive",
    no_connect: "no_connect"
  }[t] || "passive";
}
function esc(v) {
  return String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function n3(v) {
  return (Math.round(Number(v || 0) * 1000) / 1000).toFixed(3);
}

/**
 * 把内部符号结构导出为 .kicad_sym 文本
 * @param sym  {name,shapes,pins,maxUnit} —— parseKicadSym / symbolFromPdfPins / standardSymbol 的产物
 * @param meta {partNumber,footprint,datasheet,manufacturer,description,source}
 */
function exportKicadSym(sym, meta = {}) {
  const name = esc(meta.partNumber || sym.name || "PART");
  const units = Math.max(1, sym.maxUnit || 1);
  const L = [];
  const status = meta.validationState || "NOT_FOR_PRODUCTION";
  // 首部注释：即使属性被工具剥离，注释仍可被人工与脚本读到
  L.push(`; ============================================================`);
  L.push(`; status=${status}`);
  L.push(`; generator=AltPart Pro v${meta.appVersion || APP_VERSION}`);
  L.push(`; generated_at=${meta.generatedAt || new Date().toISOString()}`);
  L.push(`; source=${meta.source || "unknown"}`);
  if (meta.sourceUuid) L.push(`; source_uuid=${meta.sourceUuid}`);
  L.push(`; part=${meta.partNumber || ""}  manufacturer=${meta.manufacturer || ""}`);
  if (status === "NOT_FOR_PRODUCTION") L.push(`; WARNING: 本符号由 AltPart Pro 自动生成，引脚定义未经 datasheet 人工核对，不可直接用于生产。`);
  L.push(`; ============================================================`);
  L.push(`(kicad_symbol_lib (version 20231120) (generator "AltPart Pro") (generator_version "9.0")`);
  L.push(`  (symbol "${name}"`);
  L.push(`    (exclude_from_sim no) (in_bom yes) (on_board yes)`);
  // 属性字段
  const props = [["Reference", "U", 0, 2.54, "no"], ["Value", name, 0, -2.54, "no"], ["Footprint", esc(meta.footprint || ""), 0, -5.08, "yes"], ["Datasheet", esc(meta.datasheet || ""), 0, -7.62, "yes"], ["Description", esc(meta.description || ""), 0, -10.16, "yes"]];
  if (meta.manufacturer) props.push(["Manufacturer", esc(meta.manufacturer), 0, -12.7, "yes"]);
  if (meta.source) props.push(["AltPart_Source", esc(meta.source), 0, -15.24, "yes"]);
  // ALT-015：风险状态必须随文件持久化，脱离网页后仍可被人工与脚本识别
  props.push(["AltPart_Status", esc(meta.validationState || "NOT_FOR_PRODUCTION"), 0, -17.78, "yes"]);
  props.push(["AltPart_Generator", esc(`AltPart Pro v${meta.appVersion || APP_VERSION}`), 0, -20.32, "yes"]);
  props.push(["AltPart_GeneratedAt", esc(meta.generatedAt || new Date().toISOString()), 0, -22.86, "yes"]);
  if (meta.sourceUuid) props.push(["AltPart_SourceUUID", esc(meta.sourceUuid), 0, -25.4, "yes"]);
  for (const [k, v, x, y, hide] of props) {
    L.push(`    (property "${k}" "${v}" (at ${n3(x)} ${n3(y)} 0)`);
    L.push(`      (effects (font (size 1.27 1.27))${hide === "yes" ? " (hide yes)" : ""})`);
    L.push(`    )`);
  }
  for (let u = 1; u <= units; u++) {
    const shapes = (sym.shapes || []).filter(s => !s.unit || s.unit === 0 || s.unit === u);
    const pins = (sym.pins || []).filter(p => !p.unit || p.unit === 0 || p.unit === u);
    L.push(`    (symbol "${name}_${u}_1"`);
    for (const s of shapes) {
      if (s.kind === "rect") {
        L.push(`      (rectangle (start ${n3(s.x1)} ${n3(s.y1)}) (end ${n3(s.x2)} ${n3(s.y2)})`);
        L.push(`        (stroke (width 0.254) (type default)) (fill (type ${s.filled ? "background" : "none"}))`);
        L.push(`      )`);
      } else if (s.kind === "circle") {
        L.push(`      (circle (center ${n3(s.cx)} ${n3(s.cy)}) (radius ${n3(s.r)})`);
        L.push(`        (stroke (width 0.254) (type default)) (fill (type ${s.filled ? "background" : "none"}))`);
        L.push(`      )`);
      } else if (s.kind === "polyline") {
        L.push(`      (polyline (pts ${s.points.map(p => `(xy ${n3(p.x)} ${n3(p.y)})`).join(" ")})`);
        L.push(`        (stroke (width 0.254) (type default)) (fill (type ${s.filled ? "background" : "none"}))`);
        L.push(`      )`);
      } else if (s.kind === "arc") {
        L.push(`      (arc (start ${n3(s.start.x)} ${n3(s.start.y)}) (mid ${n3(s.mid.x)} ${n3(s.mid.y)}) (end ${n3(s.end.x)} ${n3(s.end.y)})`);
        L.push(`        (stroke (width 0.254) (type default)) (fill (type none))`);
        L.push(`      )`);
      }
    }
    for (const p of pins) {
      L.push(`      (pin ${pinTypeToKicad(p.kicadType || p.type)} line (at ${n3(p.x)} ${n3(p.y)} ${Math.round(p.angle || 0)}) (length ${n3(p.length || 2.54)})`);
      L.push(`        (name "${esc(p.name && p.name !== "~" ? p.name : "~")}" (effects (font (size 1.27 1.27))))`);
      L.push(`        (number "${esc(p.number)}" (effects (font (size 1.27 1.27))))`);
      L.push(`      )`);
    }
    L.push(`    )`);
  }
  L.push(`  )`);
  L.push(`)`);
  return L.join("\n");
}

/**
 * 给导出的 .kicad_mod 附加风险头与 3D 模型关联（ALT-015 / ALT-016）
 * · 首部注释写入 status / generator / generated_at / source
 * · 若同时提供了 STEP，则把 (model ...) 指向**同目录相对路径**，
 *   使资源包在新 KiCad 项目中无需配置 KICAD6_3DMODEL_DIR 即可显示 3D
 */
function annotateFootprint(text, meta = {}) {
  if (!text) return text;
  const status = meta.srcFp === "ezplm" || meta.srcFp === "kicad_official" ? "VERIFIED_SOURCE" : "NOT_FOR_PRODUCTION";
  const head = ["; ============================================================", `; status=${status}`, `; generator=AltPart Pro v${APP_VERSION}`, `; generated_at=${new Date().toISOString()}`, `; source=${meta.srcFp || "unknown"}`, meta.sourceUuid ? `; source_uuid=${meta.sourceUuid}` : "", `; part=${meta.partNumber || ""}  package=${meta.pkg || ""}`, status === "NOT_FOR_PRODUCTION" ? "; WARNING: 本封装依封装名推算生成，焊盘尺寸未经 datasheet 核对，不可直接用于生产。" : "", "; ============================================================"].filter(Boolean).join("\n") + "\n";
  let out = text;
  if (meta.hasStep && meta.model3dFile) {
    // 移除依赖旧版环境变量的 model 引用，改为同目录相对路径
    out = out.replace(/\(model\s+"?\$\{KICAD\d?_3DMODEL_DIR\}[^\n]*\n(?:[^)]*\)[^\n]*\n)*?\s*\)\s*\n/g, "");
    const modelBlock = `  (model "\${KIPRJMOD}/${meta.model3dFile}"\n` + `    (offset (xyz 0 0 0))\n    (scale (xyz 1 1 1))\n    (rotate (xyz 0 0 0))\n  )\n`;
    const last = out.lastIndexOf(")");
    if (last >= 0) out = out.slice(0, last) + modelBlock + out.slice(last);
  }
  return head + out;
}
function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob(["\ufeff".length ? text : text], {
    type: mime
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

// ── 3D 等轴测示意（ezPLM 提供 STEP，浏览器无法直接渲染）──
function Model3DSVG({
  pkg,
  svgRef,
  compact
}) {
  const g = parsePackage(pkg);
  if (!g) return /*#__PURE__*/React.createElement(EmptyPreview, {
    text: "\u65E0\u5C01\u88C5\u4FE1\u606F"
  });
  const W = 760,
    H = 480,
    cx = W / 2,
    cy = H / 2 + 20;
  const s = Math.min(200 / Math.max(g.bodyW, 1), 200 / Math.max(g.bodyH, 1)) * 1.1;
  const w = g.bodyW * s,
    d = g.bodyH * s,
    h = Math.max(26, w * 0.16);
  const ox = d * 0.45,
    oy = d * 0.26;
  const top = `${cx - w / 2},${cy - h} ${cx - w / 2 + ox},${cy - h - oy} ${cx + w / 2 + ox},${cy - h - oy} ${cx + w / 2},${cy - h}`;
  const right = `${cx + w / 2},${cy - h} ${cx + w / 2 + ox},${cy - h - oy} ${cx + w / 2 + ox},${cy - oy} ${cx + w / 2},${cy}`;
  // 引脚示意
  const leads = [];
  const per = Math.max(1, Math.ceil(g.pins / (g.type === "qfn" || g.type === "qfp" ? 4 : 2)));
  if (g.type !== "chip" && g.type !== "bga") {
    for (let i = 0; i < per; i++) {
      const t = per === 1 ? 0.5 : i / (per - 1);
      const y = cy - h * 0.35 - oy * t * 0.8,
        xl = cx - w / 2,
        xr = cx + w / 2;
      const ly = cy - h * 0.2 + d * 0.5 * (t - 0.5);
      leads.push(/*#__PURE__*/React.createElement("rect", {
        key: `l${i}`,
        x: xl - 14,
        y: ly,
        width: 14,
        height: 5,
        fill: "#c7ccd2",
        rx: 1
      }));
      leads.push(/*#__PURE__*/React.createElement("rect", {
        key: `r${i}`,
        x: xr,
        y: ly - oy * 0.15,
        width: 14,
        height: 5,
        fill: "#c7ccd2",
        rx: 1
      }));
    }
  }
  return /*#__PURE__*/React.createElement("svg", {
    ref: svgRef,
    viewBox: `0 0 ${W} ${H}`,
    style: {
      width: "100%",
      height: compact ? 250 : 340,
      background: "linear-gradient(160deg,#f7faf8,#eef3f0)",
      borderRadius: 8,
      border: `1px solid ${C.borderLight}`
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "topg",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#4a6357"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#33463d"
  }))), [...Array(9)].map((_, i) => /*#__PURE__*/React.createElement("line", {
    key: `gx${i}`,
    x1: cx - 260 + i * 65,
    y1: cy + 40,
    x2: cx - 200 + i * 65,
    y2: cy + 8,
    stroke: "#dde5e0",
    strokeWidth: "1"
  })), /*#__PURE__*/React.createElement("ellipse", {
    cx: cx + ox * 0.5,
    cy: cy + 10,
    rx: w * 0.66,
    ry: 10,
    fill: "#00000015"
  }), leads, /*#__PURE__*/React.createElement("rect", {
    x: cx - w / 2,
    y: cy - h,
    width: w,
    height: h,
    fill: "#2c3e35"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: top,
    fill: "url(#topg)"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: right,
    fill: "#1f2d26"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: cx - w / 2 + 16,
    cy: cy - h / 2,
    r: 4.5,
    fill: "#8fd6b4"
  }), /*#__PURE__*/React.createElement("text", {
    x: cx + ox * 0.5,
    y: H - 18,
    textAnchor: "middle",
    fontSize: 13,
    fill: "#6b8578",
    fontFamily: "'DM Mono',monospace"
  }, g.label, " \xB7 ", g.bodyW, "\xD7", g.bodyH, "mm \xB7 ", g.pins, "pin"));
}
function EmptyPreview({
  text
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "60px",
      textAlign: "center",
      color: C.textMute,
      background: C.bgSoft,
      borderRadius: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      marginBottom: 8
    }
  }, "\uD83D\uDCD0"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13
    }
  }, text));
}

// ── SVG 缩放/平移视口（移植自 kicad-part-viewer）──
function attachViewport(svg, rebase) {
  // base 取渲染器写入的 viewBox（符号是 mm 单位，封装也是），不能硬编码 800x520
  const readVB = () => {
    const v = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    return v.length === 4 && v.every(n => isFinite(n)) ? {
      x: v[0],
      y: v[1],
      w: v[2],
      h: v[3]
    } : {
      x: 0,
      y: 0,
      w: 800,
      h: 520
    };
  };
  if (svg && svg._vpBound) {
    if (rebase) {
      svg._vpBase = readVB();
      svg._vp.reset();
    } // 内容换了 → 以新 viewBox 为基准
    return svg._vp;
  }
  if (!svg) return null;
  svg._vpBase = readVB();
  const base = svg._vpBase;
  let view = {
      ...base
    },
    dragging = false,
    pid = null,
    last = {
      x: 0,
      y: 0
    },
    down = {
      x: 0,
      y: 0
    },
    moved = false;
  const apply = () => svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  const reset = () => {
    view = {
      ...(svg._vpBase || base)
    };
    apply();
  };
  const zoomAt = (f, clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = clientX == null ? r.left + r.width / 2 : clientX,
      py = clientY == null ? r.top + r.height / 2 : clientY;
    const ux = view.x + (px - r.left) / r.width * view.w,
      uy = view.y + (py - r.top) / r.height * view.h;
    const B = svg._vpBase || base;
    const nw = Math.min(B.w * 8, Math.max(B.w / 20, view.w * f)),
      nh = nw * (B.h / B.w);
    const rx = (ux - view.x) / view.w,
      ry = (uy - view.y) / view.h;
    view = {
      x: ux - rx * nw,
      y: uy - ry * nh,
      w: nw,
      h: nh
    };
    apply();
  };
  svg.addEventListener("wheel", e => {
    e.preventDefault();
    zoomAt(e.deltaY > 0 ? 1.12 : .89, e.clientX, e.clientY);
  }, {
    passive: false
  });
  svg.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    pid = e.pointerId;
    down = {
      x: e.clientX,
      y: e.clientY
    };
    last = {
      ...down
    };
    svg.setPointerCapture(pid);
    svg.style.cursor = "grabbing";
  });
  svg.addEventListener("pointermove", e => {
    if (!dragging || e.pointerId !== pid) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) moved = true;
    const r = svg.getBoundingClientRect();
    view.x -= (e.clientX - last.x) / r.width * view.w;
    view.y -= (e.clientY - last.y) / r.height * view.h;
    last = {
      x: e.clientX,
      y: e.clientY
    };
    apply();
  });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    try {
      svg.releasePointerCapture(pid);
    } catch {}
    pid = null;
    svg.style.cursor = "grab";
  };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);
  svg.addEventListener("dblclick", reset);
  svg.style.cursor = "grab";
  svg.style.touchAction = "none";
  apply();
  svg._vpBound = true;
  svg._vp = {
    reset,
    zoomIn: () => zoomAt(.78),
    zoomOut: () => zoomAt(1.28)
  };
  return svg._vp;
}

// ═══════════════════════════════════════════════════════════
// STEP 3D 在线预览（移植自 ezplm-smt-scm）
// occt-import-js(OCCT WASM 内核) 解析 STEP → three.js 渲染
// 手动触发：内核约 7.6MB + STEP 文件本身 1-3MB，不应随页面自动加载
// ═══════════════════════════════════════════════════════════
// OCCT 是 UMD 构建（非 ESM），必须用 <script> 标签加载后调全局 occtimportjs()。
// 用 import() 会被 esm.sh 注入 process 垫片，导致 Emscripten 误判为 Node 环境
// 而去调 fs.readFileSync，报 "readFileSync is not a function"。
const OCCT_LOCAL = "/vendor/occt-import-js.js";
const OCCT_CDN = "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js";
const THREE_CDN = "https://esm.sh/three@0.185.0";
const ORBIT_CDN = "https://esm.sh/three@0.185.0/examples/jsm/controls/OrbitControls.js";
const ENV_CDN = "https://esm.sh/three@0.185.0/examples/jsm/environments/RoomEnvironment.js";

// ── WebGL 预检与容错 ──────────────────────────────────────────
// 线上报「THREE.WebGLRenderer: Error creating WebGL context」有三类成因，
// 之前一律吐同一句话，用户无从下手：
//   ① 浏览器/系统禁用了硬件加速，或显卡在黑名单里 → 根本拿不到 context
//   ② 同一页反复开关 3D，旧 context 未真正释放，撞上浏览器 ~16 个的上限
//   ③ antialias/高 pixelRatio 在集显或低配机上申请失败
// 对应做三件事：预检给出可操作提示、dispose 时 forceContextLoss 真正归还、
// 创建失败逐级降级重试。
function probeWebGL() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return {
      ok: false,
      reason: "no_context"
    };
    // 用完立刻归还，避免预检本身占掉一个 context 名额
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return {
      ok: true
    };
  } catch (e) {
    return {
      ok: false,
      reason: "exception",
      message: e?.message || String(e)
    };
  }
}

/** 逐级降级创建 renderer：高画质 → 关抗锯齿 → 最低要求 */
function createRenderer(THREE) {
  const tries = [{
    antialias: true,
    alpha: true
  }, {
    antialias: false,
    alpha: true
  }, {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: false
  }];
  let last = null;
  for (const opts of tries) {
    try {
      return new THREE.WebGLRenderer(opts);
    } catch (e) {
      last = e;
    }
  }
  throw new Error("浏览器无法创建 WebGL 上下文" + (last?.message ? `（${last.message}）` : ""));
}
function loadScriptOnce(src) {
  return new Promise((res, rej) => {
    const done = [...document.scripts].some(x => x.src && x.src.indexOf(src) >= 0);
    if (done && window.occtimportjs) return res();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => res();
    el.onerror = () => rej(new Error(`脚本加载失败: ${src}`));
    document.head.appendChild(el);
  });
}

// 加载 OCCT 内核：本站 /vendor/ 优先 → CDN 兜底
async function loadOcct(setMsg) {
  let base = null;
  try {
    const head = await fetch(OCCT_LOCAL, {
      method: "HEAD"
    });
    if (head.ok) {
      setMsg?.("正在加载本站 3D 内核…");
      await loadScriptOnce(OCCT_LOCAL);
      base = "/vendor/";
    }
  } catch (e) {}
  if (!base) {
    setMsg?.("本站内核不可用，回退 CDN…");
    await loadScriptOnce(OCCT_CDN);
    base = "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/";
  }
  if (typeof window.occtimportjs !== "function") throw new Error("OCCT 内核已加载但未暴露 occtimportjs()");
  setMsg?.("正在初始化 OCCT 内核…");
  // locateFile 指向与 js 同源的 wasm
  return await window.occtimportjs({
    locateFile: f => base + f
  });
}
function Step3DViewer({
  stepUrl,
  fileName,
  compact
}) {
  const [phase, setPhase] = useState("idle"); // idle|loading|ready|error
  const [msg, setMsg] = useState("");
  const [meshCount, setMeshCount] = useState(0);
  const [stats3d, setStats3d] = useState(null); // {tri,parseMs,env} 诊断信息，也是"新代码已生效"的凭据
  const hostRef = useRef(null);
  const disposeRef = useRef(null);
  useEffect(() => () => disposeRef.current?.(), []);
  async function load() {
    const probe = probeWebGL();
    if (!probe.ok) {
      // 先于 7.6MB 内核下载拦截，避免白等一分钟再报错
      setPhase("error");
      setMsg("此浏览器当前不可用 WebGL。常见原因：浏览器设置里关闭了「使用硬件加速」，" + "或系统显卡驱动被浏览器列入黑名单。可在浏览器设置中开启硬件加速后重试，" + "或访问 chrome://gpu 查看具体原因");
      return;
    }
    setPhase("loading");
    setMsg("正在加载 3D 内核与 STEP 模型…");
    // 重试时先释放上一次的 context，否则每点一次「重试加载」就多占一个名额
    try {
      disposeRef.current?.();
    } catch {}
    disposeRef.current = null;
    try {
      // ⚠ Babel standalone 会把静态写法的 import() 转译成 require()（浏览器无此函数）。
      // 用 new Function 构造，使动态 import 在运行时才出现，绕过编译期转换。
      // three.js 是标准 ESM，用动态 import；OCCT 是 UMD，用 script 标签
      const dynImport = new Function("u", "return import(u)");
      const [occt, THREE, orbitMod, envMod] = await Promise.all([loadOcct(setMsg), dynImport(THREE_CDN), dynImport(ORBIT_CDN), dynImport(ENV_CDN).catch(() => null) // 环境贴图可选：CDN 失败仍可渲染，只是质感降级
      ]);
      const OrbitControls = orbitMod.OrbitControls;
      setMsg("正在下载 STEP 文件…");
      const res = await fetch(proxyRes(stepUrl));
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || `拉取 STEP 文件失败 (HTTP ${res.status})`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      setMsg("正在解析几何…");
      // 三角剖分精度 —— 这是"模型发糊、引脚糊成一片"的真正根源。
      // ReadStepFile 第二参传 null 时用 OCCT 默认 deflection，剖分很粗，
      // 细小引脚只分到几个三角形。KiCad 的 3D 查看器同样基于 OCCT 曲面剖分，
      // 用的是"相对包围盒的线性偏差 + 角度偏差"的精细设置，这里对齐它：
      // 线性偏差 = 包围盒对角线的 0.05%，角度偏差 0.3rad（≈17°）。
      const tParse = performance.now();
      const result = occt.ReadStepFile(bytes, {
        linearUnit: "millimeter",
        linearDeflectionType: "bounding_box_ratio",
        linearDeflection: 0.0005,
        angularDeflection: 0.3
      });
      const parseMs = Math.round(performance.now() - tParse);
      if (!result?.success || !result.meshes?.length) throw new Error("STEP 解析成功但没有可显示的网格");
      const host = hostRef.current;
      if (!host) throw new Error("渲染容器不可用");
      host.innerHTML = "";
      const width = host.clientWidth || 600,
        height = 380;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf7faf8);
      const group = new THREE.Group();
      let triCount = 0;
      // 第一遍：只建几何并统计，材质放到判定完"谁是本体"之后再定。
      // 元器件 STEP（尤其 SamacSys/ezPLM 来源）常不带颜色信息，整体渲成一色灰
      // 就会"盒子糊成一片"。参考 SamacSys 查看器的做法：
      //   最大的网格 = 塑封本体（深色、哑光）；其余小网格 = 引脚/焊盘（亮银、金属）。
      const parts = [];
      const tmpV = new THREE.Vector3();
      for (const mesh of result.meshes) {
        triCount += Math.floor((mesh.index?.array?.length || mesh.attributes.position.array.length / 3) / 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
        if (mesh.attributes.normal) geo.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));else geo.computeVertexNormals();
        if (mesh.index) geo.setIndex(mesh.index.array);
        geo.computeBoundingBox();
        const d = geo.boundingBox.getSize(tmpV);
        parts.push({
          geo,
          vol: Math.max(d.x, 1e-6) * Math.max(d.y, 1e-6) * Math.max(d.z, 1e-6),
          stepColor: mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : null
        });
      }
      const maxVol = Math.max(...parts.map(x => x.vol));
      // STEP 自带多种颜色时尊重原色；单一色/无色则按体积启发式分本体/引脚
      const distinctColors = new Set(parts.filter(x => x.stepColor).map(x => x.stepColor.getHexString()));
      const useStepColors = distinctColors.size >= 2;
      // side:DoubleSide —— OCCT 网格常有局部反向法线，单面材质从外看那些面是黑的
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x3a3f45,
        metalness: .05,
        roughness: .7,
        side: THREE.DoubleSide
      });
      const pinMat = new THREE.MeshStandardMaterial({
        color: 0xc8ccd2,
        metalness: .85,
        roughness: .35,
        side: THREE.DoubleSide
      });
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x2b2f35,
        transparent: true,
        opacity: .5
      });
      const drawEdges = triCount < 200000; // 超大模型不画边线，避免线段数爆炸
      for (const part of parts) {
        const isBody = part.vol >= maxVol * 0.5;
        const mat = useStepColors && part.stepColor ? new THREE.MeshStandardMaterial({
          color: part.stepColor,
          metalness: isBody ? .05 : .6,
          roughness: isBody ? .7 : .4,
          side: THREE.DoubleSide
        }) : isBody ? bodyMat : pinMat;
        group.add(new THREE.Mesh(part.geo, mat));
        // 棱线 —— SamacSys/KiCad 式清晰度的另一半来源：无边线的平面盒会互相糊掉
        if (drawEdges) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(part.geo, 25), edgeMat));
      }
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length() || 10;
      group.position.sub(center);
      scene.add(group);
      // renderer 必须先于环境贴图创建（PMREMGenerator 依赖它）
      const renderer = createRenderer(THREE);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      // 画布不随 CSS 拉伸：模糊的另一来源是加载瞬间 clientWidth 偏小（容器还在布局中），
      // 画布按小尺寸建缓冲、再被 CSS 拉大 → 整体发糊。固定 display:block 并在挂载后
      // 用 ResizeObserver 按真实容器宽重设缓冲。
      renderer.domElement.style.display = "block";
      host.appendChild(renderer.domElement);
      // 光照分两层：
      // ① 环境贴图（IBL）—— KiCad 3D 查看器质感的来源。PBR 材质没有环境反射时
      //    金属/半光泽面又平又暗；RoomEnvironment 生成室内环境后引脚金属质感立现。
      // ② 直射光 —— three r155 起物理光照单位，旧强度偏暗，补主光与背面补光。
      let envOk = false,
        pmrem = null;
      if (envMod?.RoomEnvironment) {
        try {
          pmrem = new THREE.PMREMGenerator(renderer);
          scene.environment = pmrem.fromScene(new envMod.RoomEnvironment(), 0.04).texture;
          envOk = true;
        } catch (e) {
          console.warn("[3D] 环境贴图生成失败，回退直射光:", e.message);
        }
      }
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, envOk ? 0.9 : 1.6));
      const dir = new THREE.DirectionalLight(0xffffff, envOk ? 1.6 : 2.2);
      dir.position.set(1, 1.4, 1);
      scene.add(dir);
      const fill = new THREE.DirectionalLight(0xffffff, envOk ? 0.8 : 1.2);
      fill.position.set(-1, .6, -1);
      scene.add(fill);
      if (!envOk) scene.add(new THREE.AmbientLight(0xffffff, .5));
      const camera = new THREE.PerspectiveCamera(45, width / height, size / 500, size * 20);
      camera.position.set(size * .7, size * .6, size * .9);
      const onCtxLost = ev => {
        ev.preventDefault();
        setPhase("error");
        setMsg("WebGL 上下文丢失（通常是同时打开的 3D 视图过多或显卡驱动重置），可点重试");
      };
      renderer.domElement.addEventListener("webglcontextlost", onCtxLost);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        controls.update();
        renderer.render(scene, camera);
      };
      tick();
      const onResize = () => {
        const w = host.clientWidth || width;
        if (Math.abs(w - renderer.domElement.clientWidth) < 2) return;
        camera.aspect = w / height;
        camera.updateProjectionMatrix();
        renderer.setSize(w, height);
      };
      window.addEventListener("resize", onResize);
      // window resize 抓不到"容器自身变宽"（布局完成/侧栏折叠/弹窗放大），ResizeObserver 才行
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
      ro?.observe(host);
      onResize(); // 挂载后立即按真实宽度校正一次（加载瞬间测到的宽度常偏小）
      disposeRef.current = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        ro?.disconnect();
        renderer.domElement.removeEventListener("webglcontextlost", onCtxLost);
        controls.dispose();
        // dispose() 只释放 GPU 资源，不归还 context；不 forceContextLoss 的话
        // 反复开关几次就会耗尽浏览器的 context 名额，之后一律「Error creating WebGL context」
        try {
          pmrem?.dispose();
        } catch {}
        // 边线让几何对象翻倍，逐一释放，避免反复开关累积显存
        try {
          group.traverse(o => {
            o.geometry?.dispose?.();
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose?.());
          });
        } catch {}
        try {
          renderer.forceContextLoss();
        } catch {}
        renderer.dispose();
        host.innerHTML = "";
      };
      setMeshCount(result.meshes.length);
      setStats3d({
        tri: triCount,
        parseMs,
        env: envOk
      });
      setPhase("ready");
    } catch (e) {
      setPhase("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap",
      marginBottom: 8,
      justifyContent: compact ? "center" : "flex-start"
    }
  }, (phase === "idle" || phase === "error") && /*#__PURE__*/React.createElement("button", {
    onClick: load,
    style: {
      padding: compact ? "7px 14px" : "9px 18px",
      borderRadius: 8,
      border: "none",
      background: C.green,
      color: "#fff",
      fontSize: compact ? 12 : 13,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, phase === "error" ? "重试加载" : "▶ 加载 3D 模型"), !compact && /*#__PURE__*/React.createElement("a", {
    href: proxyRes(stepUrl),
    target: "_blank",
    rel: "noreferrer",
    download: true,
    style: {
      padding: "8px 14px",
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      background: "#fff",
      color: C.textSec,
      fontSize: 12,
      textDecoration: "none"
    }
  }, "\u2B07 \u4E0B\u8F7D STEP \u6E90\u6587\u4EF6"), !compact && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: C.textMute,
      flex: 1,
      minWidth: 200
    }
  }, fileName ? `${fileName} · ` : "", "\u9700\u4E0B\u8F7D\u7EA6 7.6MB \u7684 3D \u5185\u6838\u4E0E STEP \u6587\u4EF6\uFF0C\u6545\u624B\u52A8\u89E6\u53D1\u3002")), compact && phase === "idle" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: C.textMute,
      textAlign: "center",
      marginBottom: 6
    }
  }, "\u7EA6 7.6MB \u5185\u6838\uFF0C\u6309\u9700\u52A0\u8F7D"), phase === "loading" && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: compact ? "24px 8px" : "40px",
      textAlign: "center",
      color: C.textMute
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      border: `3px solid ${C.borderLight}`,
      borderTopColor: C.green,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
      margin: "0 auto 10px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12
    }
  }, msg)), phase === "error" && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 14px",
      borderRadius: 8,
      background: "#fdeaea",
      border: "1px solid #f5c6c6",
      color: "#a0302a",
      fontSize: 12
    }
  }, "3D \u9884\u89C8\u5931\u8D25\uFF1A", msg, "\u3002\u53EF\u4E0B\u8F7D STEP \u6E90\u6587\u4EF6\u7528 KiCad / FreeCAD \u6253\u5F00\u3002"), phase === "ready" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: C.textMute,
      marginBottom: 6
    }
  }, "\u5DF2\u6E32\u67D3 ", meshCount, " \u7F51\u683C \xB7 ", (stats3d?.tri ?? 0).toLocaleString(), " \u4E09\u89D2\u5F62 \xB7 \u89E3\u6790 ", stats3d?.parseMs ?? 0, "ms", stats3d && !stats3d.env && " · 环境贴图未加载(质感降级)", " \xB7 v", APP_VERSION, " \xB7 \u5DE6\u952E\u65CB\u8F6C / \u6EDA\u8F6E\u7F29\u653E"), /*#__PURE__*/React.createElement("div", {
    ref: hostRef,
    style: {
      borderRadius: 8,
      overflow: "hidden",
      border: phase === "ready" ? `1px solid ${C.borderLight}` : "none"
    }
  }));
}

// ═══ 图形预览面板：符号 / 封装 / 3D 三栏并排 ═══
// eCAD 结果模块级缓存：切换 Tab 会卸载组件，重挂载时直接复用，避免重复拉取与生成
const ECAD_CACHE = new Map(); // pn -> {fpText,fpReal,symText,symReal,ksym,kskip,srcSym,srcFp,pdfWarn,extUrl}

function GraphicsPanel({
  d,
  pn
}) {
  const cached = ECAD_CACHE.get(pn) || null;
  const [fpText, setFpText] = useState(cached?.fpText ?? null);
  const [symText, setSymText] = useState(cached?.symText ?? null);
  const [fpReal, setFpReal] = useState(cached?.fpReal ?? false);
  const [symReal, setSymReal] = useState(cached?.symReal ?? false);
  const [ksym, setKSym] = useState(cached?.ksym ?? null);
  const [kskip, setKSkip] = useState(cached?.kskip ?? 0);
  const [unit, setUnit] = useState(1);
  const [loading, setLoading] = useState(!cached);
  const [pin, setPin] = useState(null);
  // 点击焊盘时若该引脚不在当前显示单元，自动切到包含它的单元（LM358 点 pad5 应跳到 B 单元）
  const togglePin = v => {
    const nv = normPin(v);
    setPin(prev => samePin(prev, nv) ? null : nv);
    if (ksym?.maxUnit > 1 && nv) {
      const inCur = (ksym.pins || []).some(p => (!p.unit || p.unit === 0 || p.unit === unit) && samePin(p.number, nv));
      if (!inCur) {
        const target = (ksym.pins || []).find(p => samePin(p.number, nv) && p.unit > 0);
        if (target) setUnit(target.unit);
      }
    }
  };
  const [zoomed, setZoomed] = useState(null);
  const [srcSym, setSrcSym] = useState(cached?.srcSym ?? "");
  const [srcFp, setSrcFp] = useState(cached?.srcFp ?? "");
  const [pdfWarn, setPdfWarn] = useState(cached?.pdfWarn ?? "");
  const [extUrl, setExtUrl] = useState(cached?.extUrl ?? {});
  const [aiTry, setAiTry] = useState(false); // 用户是否已选择尝试 AI 推断引脚
  const [aiBusy, setAiBusy] = useState(false);
  const fpRef = useRef(null),
    symRef = useRef(null);
  const bigFpRef = useRef(null),
    bigSymRef = useRef(null);
  const pkg = d?.footprint || (d?.parameters || []).find(p => /封装|package/i.test(p.name))?.value;
  useEffect(() => {
    if (ECAD_CACHE.has(pn)) return; // 已缓存，不再重复生成
    let dead = false;
    (async () => {
      setLoading(true);
      setPin(null);
      let ft = null,
        real = false;
      if (d?.footprintFileUrl) {
        try {
          const r = await fetch(proxyRes(d.footprintFileUrl));
          if (r.ok) {
            const t = await r.text();
            if (t.includes("(pad") || t.includes("(fp_")) {
              ft = t;
              real = true;
            }
          }
        } catch (e) {}
      }
      if (!ft) ft = synthKicadMod(pkg);
      let st = null,
        sreal = false,
        ks = null,
        kskp = 0;
      if (d?.symbolUrl) {
        try {
          const r = await fetch(proxyRes(d.symbolUrl));
          if (r.ok) {
            const raw = await r.text();
            if (raw.includes("(kicad_symbol_lib")) {
              try {
                const ps = parseKicadSym(raw);
                ks = ps;
                kskp = ps.skipped;
                sreal = true;
              } catch (e) {}
            }
            if (!ks) {
              const conv = extractLegacySymbol(raw, pn) || modernSymbolToLegacy(raw, pn) || extractLegacySymbol(raw, d?.partNumber);
              if (conv) {
                st = conv;
                sreal = true;
              }
            }
          }
        } catch (e) {}
      }
      // ── eCAD 级联：ezPLM → KiCad 官方库 → PDF 数据手册 → 标准/推算 ──
      let sSrc = sreal ? "ezplm" : "",
        fSrc = real ? "ezplm" : "",
        warn = "",
        ext = {};
      if (!ks && !st || !real) {
        try {
          const gp0 = parsePackage(pkg);
          const kindGuess = detectSymbolKind(`${d?.category || ""} ${d?.description || ""}`) || (/mcu|微控制器|microcontroller/i.test(`${d?.category || ""}`) ? "mcu" : "");
          const q = new URLSearchParams({
            pn
          });
          if (pkg) q.set("footprint", pkg);
          if (kindGuess) q.set("kind", String(kindGuess).toLowerCase());
          if (d?.datasheetUrl) q.set("datasheet", d.datasheetUrl);
          if (gp0?.pins) q.set("pins", String(gp0.pins));
          const r = await fetch(`/api/v2/ecad?${q}`);
          const e = await r.json().catch(() => null);
          if (e?.success) {
            if (!ks && !st && e.symbol?.text) {
              try {
                const ps = parseKicadSym(e.symbol.text);
                ks = ps;
                kskp = ps.skipped;
                sSrc = "kicad_official";
                ext.symbol = e.symbol.url;
              } catch (err) {}
            }
            if (!ks && !st && e.pdfPins?.pins?.length) {
              const sp = symbolFromPdfPins(pn, e.pdfPins.pins);
              if (sp) {
                ks = sp;
                sSrc = "pdf_datasheet";
                warn = e.pdfPins.warning || "";
              }
            }
            if (!real && e.footprint?.text) {
              ft = e.footprint.text;
              real = true;
              fSrc = "kicad_official";
              ext.footprint = e.footprint.url;
            }
            if (e.model3d?.url) ext.model3d = e.model3d.url;
          }
        } catch (err) {}
      }
      if (!ks && !st) {
        const kind = detectSymbolKind(`${d?.category || ""} ${d?.description || ""}`);
        const gp = parsePackage(pkg);
        // 标准符号的引脚数必须与实际封装一致（教训：AD8331ARQZ 是 SSOP-20，曾被套 5 脚运放符号）
        let stdOK = false;
        if (kind) {
          const probe = standardSymbol(kind, pn);
          stdOK = !!probe && (!gp?.pins || gp.pins === probe.pins.length);
        }
        if (stdOK) {
          ks = standardSymbol(kind, pn);
          sSrc = "standard";
        }
        if (!ks) {
          const pinAttr = (d?.parameters || []).find(x => /引脚定义|pinout|pin\s*name/i.test(x.name));
          const names = pinAttr ? String(pinAttr.value).split(/[,，;；]/).map(t => t.trim()) : null;
          ks = synthSymbol(pn, gp?.pins || 8, names);
          sSrc = "synth";
        }
      }
      if (!fSrc) fSrc = real ? "ezplm" : "synth";
      if (dead) return;
      setFpText(ft);
      setFpReal(real);
      setSymText(st);
      setSymReal(sreal);
      ECAD_CACHE.set(pn, {
        fpText: ft,
        fpReal: real,
        symText: st,
        symReal: sreal,
        ksym: ks,
        kskip: kskp,
        srcSym: sSrc,
        srcFp: fSrc,
        pdfWarn: warn,
        extUrl: ext
      });
      setKSym(ks);
      setKSkip(kskp);
      setUnit(1);
      setSrcSym(sSrc);
      setSrcFp(fSrc);
      setPdfWarn(warn);
      setExtUrl(ext);
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [d, pn, pkg]);

  // 三栏小图渲染
  useEffect(() => {
    if (!loading && fpRef.current && fpText) {
      renderFootprintToSvg(fpText, fpRef.current, togglePin, pin);
      attachViewport(fpRef.current, true);
    }
  }, [loading, fpText, pin]);
  useEffect(() => {
    if (loading || !symRef.current) return;
    if (ksym) renderKicadSymTo(ksym, symRef.current, togglePin, pin, unit);else if (symText) renderSymbolToSvg(symText, symRef.current, 1, togglePin, pin);
    attachViewport(symRef.current, true);
  }, [loading, symText, ksym, pin, unit]);
  // 放大视图渲染
  useEffect(() => {
    if (zoomed === "footprint" && bigFpRef.current && fpText) {
      renderFootprintToSvg(fpText, bigFpRef.current, togglePin, pin);
      attachViewport(bigFpRef.current, true);
    }
    if (zoomed === "symbol" && bigSymRef.current) {
      if (ksym) renderKicadSymTo(ksym, bigSymRef.current, togglePin, pin, unit);else if (symText) renderSymbolToSvg(symText, bigSymRef.current, 1, togglePin, pin);
      attachViewport(bigSymRef.current, true);
    }
  }, [zoomed, fpText, symText, ksym, pin, unit]);
  const tryAiPinout = async () => {
    setAiBusy(true);
    try {
      const gp0 = parsePackage(pkg);
      const q = new URLSearchParams({
        pn,
        aiPinout: "1"
      });
      if (pkg) q.set("footprint", pkg);
      if (gp0?.pins) q.set("pins", String(gp0.pins));
      const r = await fetch(`/api/v2/ecad?${q}`);
      const e = await r.json().catch(() => null);
      if (e?.aiPinout?.pins?.length) {
        const sp = symbolFromPdfPins(pn, e.aiPinout.pins);
        if (sp) {
          setKSym(sp);
          setSrcSym("ai_pinout");
          setPdfWarn(e.aiPinout.warning || "");
          setAiTry(true);
          setAiBusy(false);
          const c = ECAD_CACHE.get(pn) || {};
          ECAD_CACHE.set(pn, {
            ...c,
            ksym: sp,
            srcSym: "ai_pinout",
            pdfWarn: e.aiPinout.warning || ""
          });
          return;
        }
      }
      setPdfWarn(e?.aiPinoutRejected?.message ? `AI 引脚推断未采用：${e.aiPinoutRejected.message}${e.aiPinoutRejected.detail ? `（${e.aiPinoutRejected.detail}）` : ""}。已保持仅编号符号` : "AI 未能给出可信的引脚定义（引脚数不符或自评不确定），已保持仅编号符号");
      setAiTry(true);
    } catch (err) {
      setPdfWarn("AI 引脚推断失败");
    }
    setAiBusy(false);
  };
  const SRC_BADGE = {
    ezplm: {
      t: "✓ ezPLM 库文件",
      c: C.green,
      bg: C.greenLight,
      b: C.greenMid,
      tip: "来自 ezPLM 元器件库的原始 KiCad 文件"
    },
    kicad_official: {
      t: "✓ KiCad 官方库",
      c: C.green,
      bg: C.greenLight,
      b: C.greenMid,
      tip: "来自 KiCad 官方库 (gitlab.com/kicad/libraries)，符合 KLC 规范"
    },
    pdf_datasheet: {
      t: "◇ PDF数据手册生成",
      c: C.indigo,
      bg: C.indigoBg,
      b: C.indigoBorder,
      tip: "由程序解析 datasheet 引脚表生成，引脚名与类型来自原文，图形排布为自动布局，需人工确认"
    },
    standard: {
      t: "◇ 标准符号(自动生成)",
      c: C.indigo,
      bg: C.indigoBg,
      b: C.indigoBorder,
      tip: "电阻/电容/二极管等为 IEC/IEEE 标准图形，依品类生成；引脚定义请以 datasheet 为准"
    },
    ai_pinout: {
      t: "⚠ AI生成(引脚名待核)",
      c: C.amber,
      bg: C.amberBg,
      b: "#f0dca0",
      tip: "ezPLM / KiCad 官方库 / PDF 均未取得符号，引脚名由 AI 提供、布局由程序按 KiCad 惯例生成；引脚定义未经 datasheet 核对，务必人工确认"
    },
    synth: {
      t: "⚠ AI生成(仅编号)",
      c: C.amber,
      bg: C.amberBg,
      b: "#f0dca0",
      tip: "各来源均未取得引脚名，此图仅按封装引脚数推算编号，不可用于生产"
    }
  };
  const srcBadge = k => {
    const m = SRC_BADGE[k] || SRC_BADGE.synth;
    return /*#__PURE__*/React.createElement("span", {
      title: m.tip,
      style: {
        fontSize: 10,
        padding: "2px 7px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        background: m.bg,
        color: m.c,
        border: `1px solid ${m.b}`
      }
    }, m.t);
  };
  const badge = (ok, label) => /*#__PURE__*/React.createElement("span", {
    title: ok ? "由本系统解析绘制，字体与隐藏属性等细节可能与 KiCad 显示存在差异，以源文件为准" : "ezPLM 未提供该资源，此图依封装名推算生成，非精确制造数据",
    style: {
      fontSize: 10,
      padding: "2px 7px",
      borderRadius: 4,
      whiteSpace: "nowrap",
      background: ok ? C.greenLight : C.amberBg,
      color: ok ? C.green : C.amber,
      border: `1px solid ${ok ? C.greenMid : "#f0dca0"}`
    }
  }, ok ? `✓ ${label}` : "⚠ 示意渲染");
  const card = (title, extra, body, foot, onZoom, dl) => /*#__PURE__*/React.createElement("div", {
    style: {
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      background: "#fff",
      padding: "12px 12px 10px",
      display: "flex",
      flexDirection: "column",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: C.text
    }
  }, title), extra), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 240,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, body), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 8,
      minHeight: 22
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: C.textMute
    }
  }, foot), onZoom && /*#__PURE__*/React.createElement("button", {
    onClick: onZoom,
    style: {
      padding: "3px 10px",
      borderRadius: 6,
      border: `1px solid ${C.border}`,
      background: "#fff",
      color: C.textSec,
      fontSize: 11,
      cursor: "pointer",
      whiteSpace: "nowrap"
    }
  }, "\u26F6 \u653E\u5927")), dl && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      paddingTop: 8,
      borderTop: `1px dashed ${C.borderLight}`,
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      justifyContent: "center"
    }
  }, dl));

  // 各栏下载区：按该栏实际来源给出对应操作
  const kicadFpLib = () => srcFp === "kicad_official" && extUrl.footprint ? extUrl.footprint.split("/").slice(-2)[0].replace(".pretty", "") : "Package";
  const symMeta = () => ({
    partNumber: pn,
    footprint: pkg ? `${kicadFpLib()}:${pkg}` : "",
    datasheet: d?.datasheetUrl || "",
    manufacturer: d?.manufacturer || "",
    description: d?.description || "",
    source: {
      ezplm: "ezPLM 库文件",
      kicad_official: "KiCad 官方库",
      pdf_datasheet: "PDF 数据手册解析",
      standard: "品类标准符号",
      ai_pinout: "AI 推断(未验证)",
      synth: "引脚数推算(未验证)"
    }[srcSym] || srcSym,
    appVersion: APP_VERSION,
    generatedAt: new Date().toISOString(),
    sourceUuid: d?.ezplmId || d?.identity?.packageVariantId || "",
    // 仅来自权威库的符号才算已验证
    validationState: srcSym === "ezplm" || srcSym === "kicad_official" ? "VERIFIED_SOURCE" : "NOT_FOR_PRODUCTION"
  });
  const dlSymbol = /*#__PURE__*/React.createElement(React.Fragment, null, srcSym === "ezplm" && d?.symbolUrl && /*#__PURE__*/React.createElement(DownloadButton, {
    label: "\u539F\u59CB\u7B26\u53F7",
    filename: d.symbolFileName || `${pn}.kicad_sym`,
    source: "ezplm",
    verified: true,
    href: proxyRes(d.symbolUrl)
  }), srcSym === "kicad_official" && extUrl.symbol && /*#__PURE__*/React.createElement(DownloadButton, {
    label: "\u5B98\u65B9\u7B26\u53F7",
    filename: `${pn}.kicad_sym`,
    source: "kicad",
    verified: true,
    href: extUrl.symbol
  }), ksym && /*#__PURE__*/React.createElement(DownloadButton, {
    label: "\u5BFC\u51FA .kicad_sym",
    filename: `${pn}.kicad_sym`,
    source: srcSym === "ezplm" || srcSym === "kicad_official" ? "generated" : "ai",
    verified: srcSym === "ezplm" || srcSym === "kicad_official" || srcSym === "pdf_datasheet",
    title: "\u5BFC\u51FA\u4E3A KiCad 7/8/9 \u901A\u7528\u683C\u5F0F\uFF0C\u542B\u6765\u6E90\u6807\u6CE8",
    onDownload: () => downloadText(`${pn}.kicad_sym`, exportKicadSym(ksym, symMeta()), "application/octet-stream")
  }));
  const dlFootprint = /*#__PURE__*/React.createElement(React.Fragment, null, srcFp === "ezplm" && d?.footprintFileUrl && /*#__PURE__*/React.createElement(DownloadButton, {
    label: "\u539F\u59CB\u5C01\u88C5",
    filename: d.footprintFileName || "footprint.kicad_mod",
    source: "ezplm",
    verified: true,
    href: proxyRes(d.footprintFileUrl)
  }), srcFp === "kicad_official" && extUrl.footprint && /*#__PURE__*/React.createElement(DownloadButton, {
    label: "\u5B98\u65B9\u5C01\u88C5",
    filename: `${pkg || pn}.kicad_mod`,
    source: "kicad",
    verified: true,
    href: extUrl.footprint
  }), fpText && /*#__PURE__*/React.createElement(DownloadButton, {
    label: "\u5BFC\u51FA .kicad_mod",
    filename: `${(pkg || pn).replace(/[^\w.\-]/g, "_")}.kicad_mod`,
    source: srcFp === "ezplm" || srcFp === "kicad_official" ? "generated" : "ai",
    verified: srcFp !== "synth",
    title: srcFp === "synth" ? "依封装名推算生成的示意封装，不可直接用于生产" : "导出当前显示的封装文件",
    onDownload: () => downloadText(`${(pkg || pn).replace(/[^\w.\-]/g, "_")}.kicad_mod`, annotateFootprint(fpText, {
      partNumber: pn,
      pkg,
      srcFp,
      model3dFile: d?.model3dFileName || (pkg ? `${pkg}.step` : ""),
      hasStep: !!(d?.model3dUrl || extUrl.model3d),
      sourceUuid: d?.ezplmId || ""
    }), "application/octet-stream")
  }));
  const dl3D = /*#__PURE__*/React.createElement(React.Fragment, null, d?.model3dUrl && /*#__PURE__*/React.createElement(DownloadButton, {
    label: "STEP \u6A21\u578B",
    filename: d.model3dFileName || `${pn}.step`,
    source: "ezplm",
    verified: true,
    href: proxyRes(d.model3dUrl)
  }), !d?.model3dUrl && extUrl.model3d && /*#__PURE__*/React.createElement(DownloadButton, {
    label: "STEP \u6A21\u578B",
    filename: `${pkg || pn}.step`,
    source: "kicad",
    verified: true,
    href: extUrl.model3d
  }), !d?.model3dUrl && !extUrl.model3d && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: C.textMute
    }
  }, "\u65E0\u53EF\u4E0B\u8F7D\u7684 3D \u6A21\u578B"));
  if (loading) return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "60px",
      textAlign: "center",
      color: C.textMute
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      border: `3px solid ${C.borderLight}`,
      borderTopColor: C.green,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
      margin: "0 auto 10px"
    }
  }), "\u6B63\u5728\u52A0\u8F7D KiCad \u5E93\u6587\u4EF6\u2026");
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "graphics-grid",
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,minmax(0,1fr))",
      gap: 14
    }
  }, card("🔣 原理图符号", /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, ksym?.maxUnit > 1 && /*#__PURE__*/React.createElement("select", {
    value: unit,
    onChange: e => setUnit(Number(e.target.value)),
    style: {
      padding: "3px 6px",
      borderRadius: 5,
      border: `1px solid ${C.border}`,
      fontSize: 11,
      background: "#fff",
      cursor: "pointer",
      maxWidth: 130
    }
  }, Array.from({
    length: ksym.maxUnit
  }, (_, i) => i + 1).map(u => /*#__PURE__*/React.createElement("option", {
    key: u,
    value: u
  }, ksym.unitLabels?.[u] || `单元 ${u}`))), srcBadge(srcSym)), /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    ref: symRef,
    viewBox: "0 0 800 520",
    style: {
      width: "100%",
      height: 250,
      background: "#fffdf5",
      borderRadius: 8,
      border: `1px solid ${C.borderLight}`
    }
  }), srcSym === "synth" && !aiTry && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: tryAiPinout,
    disabled: aiBusy,
    style: {
      padding: "6px 14px",
      borderRadius: 7,
      border: `1px solid ${C.amber}60`,
      background: C.amberBg,
      color: C.amber,
      fontSize: 11,
      cursor: aiBusy ? "wait" : "pointer"
    }
  }, aiBusy ? "推断中…" : "⚠ 尝试用 AI 推断引脚名（不可靠，需核对 datasheet）"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: C.textMute,
      marginTop: 4
    }
  }, "\u5404\u6743\u5A01\u6765\u6E90\u5747\u65E0\u6B64\u5668\u4EF6\u7B26\u53F7\u3002AI \u63A8\u65AD\u7684\u5F15\u811A\u540D\u66FE\u51FA\u73B0\u6574\u4EFD\u7F16\u9020\u7684\u60C5\u51B5\uFF0C\u4EC5\u4F9B\u53C2\u8003\u65B9\u5411\u3002"))), pdfWarn ? `⚠ ${pdfWarn}` : kskip > 0 ? `⚠ ${kskip} 个图元未渲染` : "滚轮缩放 · 拖拽平移", () => setZoomed("symbol"), dlSymbol), card("📐 PCB 封装", srcBadge(srcFp), /*#__PURE__*/React.createElement("svg", {
    ref: fpRef,
    viewBox: "0 0 800 520",
    style: {
      width: "100%",
      height: 250,
      background: "#fff",
      borderRadius: 8,
      border: `1px solid ${C.borderLight}`
    }
  }), "滚轮缩放 · 拖拽平移", () => setZoomed("footprint"), dlFootprint), card("🧊 3D 模型", d?.model3dUrl ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: "2px 7px",
      borderRadius: 4,
      background: C.greenLight,
      color: C.green,
      border: `1px solid ${C.greenMid}`
    }
  }, "\u2713 \u771F\u5B9E STEP") : badge(false, ""), d?.model3dUrl ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement(Step3DViewer, {
    stepUrl: d.model3dUrl,
    fileName: d.model3dFileName,
    compact: true
  })) : /*#__PURE__*/React.createElement(Model3DSVG, {
    pkg: pkg,
    compact: true
  }), d?.model3dUrl ? "点「加载 3D 模型」后可旋转" : "ezPLM 未提供 STEP", null, dl3D)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      fontSize: 11,
      color: C.textMute,
      marginTop: 10
    }
  }, "\uD83D\uDCA1 \u70B9\u51FB\u7B26\u53F7\u5F15\u811A\u6216\u5C01\u88C5\u710A\u76D8\u53EF\u9AD8\u4EAE\u5BF9\u5E94\u4F4D\u7F6E", pin != null ? ` · 当前选中 Pin ${pin}` : "", pin != null && /*#__PURE__*/React.createElement("button", {
    onClick: () => setPin(null),
    style: {
      marginLeft: 8,
      padding: "1px 8px",
      borderRadius: 4,
      border: `1px solid ${C.border}`,
      background: "#fff",
      fontSize: 11,
      cursor: "pointer"
    }
  }, "\u6E05\u9664")), zoomed && zoomed !== "model3d" && /*#__PURE__*/React.createElement("div", {
    onClick: () => setZoomed(null),
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(26,46,35,.5)",
      zIndex: 1100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "#fff",
      borderRadius: 14,
      padding: 16,
      width: "min(1000px,95vw)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700
    }
  }, zoomed === "symbol" ? "🔣 原理图符号" : "📐 PCB 封装", " \xB7 ", pn), /*#__PURE__*/React.createElement("button", {
    onClick: () => setZoomed(null),
    style: {
      width: 30,
      height: 30,
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      background: "#fff",
      cursor: "pointer"
    }
  }, "\u2715")), zoomed === "symbol" ? /*#__PURE__*/React.createElement("svg", {
    ref: bigSymRef,
    viewBox: "0 0 800 520",
    style: {
      width: "100%",
      height: "65vh",
      background: "#fffdf5",
      borderRadius: 8,
      border: `1px solid ${C.borderLight}`
    }
  }) : /*#__PURE__*/React.createElement("svg", {
    ref: bigFpRef,
    viewBox: "0 0 800 520",
    style: {
      width: "100%",
      height: "65vh",
      background: "#fff",
      borderRadius: 8,
      border: `1px solid ${C.borderLight}`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      fontSize: 11,
      color: C.textMute,
      marginTop: 8
    }
  }, "\u6EDA\u8F6E\u7F29\u653E \xB7 \u62D6\u62FD\u5E73\u79FB \xB7 \u53CC\u51FB\u590D\u4F4D"))));
}

/**
 * 统一下载按钮：所有下载操作尺寸/间距/字号一致。
 * 来源与风险通过 badge 表达，不用按钮颜色暗示（此前"生成文件"用绿底、"原始文件"用白底，
 * 同一组操作视觉割裂，且用颜色传达语义不可靠）。
 */
function DownloadButton({
  label,
  filename,
  source,
  verified,
  href,
  onDownload,
  title
}) {
  const BADGE = {
    ezplm: {
      t: "ezPLM 原始",
      c: "#1a6c4e",
      bg: "#e8f5ef",
      b: "#c2e5d3"
    },
    kicad: {
      t: "KiCad 官方",
      c: "#1a6c4e",
      bg: "#e8f5ef",
      b: "#c2e5d3"
    },
    generated: {
      t: "生成文件",
      c: "#b8860b",
      bg: "#fef9ed",
      b: "#f0dca0"
    },
    ai: {
      t: "AI 生成 · 未验证",
      c: "#b8860b",
      bg: "#fef9ed",
      b: "#f0dca0"
    }
  }[source] || null;
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 32,
    padding: "0 12px",
    borderRadius: 7,
    border: "1px solid #d4e8dc",
    background: "#fff",
    color: "#1a2e23",
    fontSize: 12,
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: 1
  };
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2B07"), /*#__PURE__*/React.createElement("span", null, label), BADGE && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      padding: "1px 5px",
      borderRadius: 3,
      background: BADGE.bg,
      color: BADGE.c,
      border: `1px solid ${BADGE.b}`,
      fontWeight: 600
    }
  }, BADGE.t), source === "generated" || source === "ai" ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "#b8860b"
    }
  }, "NOT_FOR_PRODUCTION") : null);
  const aria = `下载 ${filename || label}${verified === false ? "（未验证）" : ""}`;
  return href ? /*#__PURE__*/React.createElement("a", {
    href: href,
    target: "_blank",
    rel: "noreferrer",
    download: filename || undefined,
    style: base,
    "aria-label": aria,
    title: title
  }, inner) : /*#__PURE__*/React.createElement("button", {
    onClick: onDownload,
    style: base,
    "aria-label": aria,
    title: title
  }, inner);
}
const DL_SM = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid #d4e8dc",
  background: "#fff",
  color: "#4a6b58",
  fontSize: 11,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
  lineHeight: 1.4
};
const DL_BTN = {
  padding: "7px 14px",
  borderRadius: 7,
  border: "1px solid #d4e8dc",
  background: "#fff",
  color: "#1a6c4e",
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap"
};

// ═══ 器件详情弹窗（ezPLM 参数 / 实时行情 / 可下载资源 / 参考设计）═══
function PartDetailModal({
  pn,
  rec,
  onClose
}) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    const onKey = e => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // 焦点陷阱：Tab 在弹窗内循环，不跑到背景页面
      const f = dialogRef.current.querySelectorAll('a[href],button:not([disabled]),select,input,textarea,[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const t = setTimeout(() => {
      const first = dialogRef.current?.querySelector('button,a[href],select,input');
      first?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      clearTimeout(t);
      try {
        returnFocusRef.current?.focus();
      } catch (e) {} // 关闭后焦点归还
    };
  }, [onClose]);
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("specs");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v2/part-detail/${encodeURIComponent(pn)}`).then(r => r.ok ? r.json() : null).then(x => {
      if (!cancelled) {
        setD(x || {
          inPLM: false
        });
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setD({
          inPLM: false
        });
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pn]);
  const m = d?.market;
  const offers = m?.offers || [];
  const params = d?.parameters || [];
  const downloads = d?.downloads || [];
  const refs = d?.referenceDesigns || [];
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(26,46,35,0.45)",
      zIndex: 1000,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "32px 20px",
      overflowY: "auto",
      animation: "fadeUp 0.2s ease both"
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: dialogRef,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "part-detail-title",
    onClick: e => e.stopPropagation(),
    style: {
      background: "#fff",
      borderRadius: 14,
      maxWidth: 1180,
      width: "100%",
      boxShadow: "0 24px 64px rgba(0,0,0,0.25)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 24px",
      borderBottom: `1px solid ${C.borderLight}`,
      display: "flex",
      alignItems: "flex-start",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    id: "part-detail-title",
    style: {
      fontSize: 22,
      fontWeight: 700,
      fontFamily: "'DM Mono',monospace",
      color: C.text
    }
  }, pn), d?.inPLM && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "2px 8px",
      borderRadius: 4,
      background: C.greenLight,
      color: C.green,
      fontSize: 11,
      fontWeight: 600,
      border: `1px solid ${C.greenMid}`
    }
  }, "\u2713 ezPLM \u5DF2\u6536\u5F55")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: C.textMute
    }
  }, d?.manufacturer || rec?.manufacturer), d?.description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: C.textSec,
      marginTop: 4
    }
  }, d.description)), m && m.priceUSD1 != null && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right",
      minWidth: 130
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: C.textMute
    }
  }, "\u53C2\u8003\u4EF7\u683C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 26,
      fontWeight: 700,
      color: C.green,
      fontFamily: "'DM Mono',monospace"
    }
  }, "$", m.priceUSD1), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: m.stock === "有货" || m.stock === "充足" ? C.green : C.amber
    }
  }, m.stock, m.stockQty ? ` · ${m.stockQty.toLocaleString()}` : "")), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 32,
      height: 32,
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      background: "#fff",
      fontSize: 16,
      cursor: "pointer",
      color: C.textSec
    }
  }, "\u2715")), loading && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "60px",
      textAlign: "center",
      color: C.textMute
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      border: `3px solid ${C.borderLight}`,
      borderTopColor: C.green,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
      margin: "0 auto 12px"
    }
  }), "\u6B63\u5728\u52A0\u8F7D\u5668\u4EF6\u8BE6\u60C5\u4E0E\u5B9E\u65F6\u884C\u60C5\u2026"), !loading && !d?.inPLM && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "40px",
      textAlign: "center",
      color: C.textMute
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 36,
      marginBottom: 10
    }
  }, "\uD83D\uDCED"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      marginBottom: 6
    }
  }, "\u8BE5\u5668\u4EF6\u672A\u6536\u5F55\u4E8E ezPLM \u5143\u5668\u4EF6\u5E93"), m && m.priceUSD1 != null && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12
    }
  }, "\u4F46\u5DF2\u83B7\u53D6\u5230\u5E02\u573A\u884C\u60C5\uFF0C\u89C1\u4E0A\u65B9\u4EF7\u683C")), !loading && d?.inPLM && (d.blockedResources || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "0 24px",
      padding: "8px 12px",
      borderRadius: 7,
      background: C.amberBg,
      border: "1px solid #f0dca0",
      color: "#854f0b",
      fontSize: 11
    }
  }, "\u26A0 \u6709 ", d.blockedResources.length, " \u9879\u8D44\u6E90\u56E0\u4E0E\u5F53\u524D\u5668\u4EF6\u8EAB\u4EFD\u4E0D\u7B26\u5DF2\u88AB\u62E6\u622A\uFF08", d.blockedResources.map(b => b.fname || b.type).join("、"), "\uFF09\u3002 \u8FD9\u4E9B\u6587\u4EF6\u5C5E\u4E8E\u5176\u5B83\u578B\u53F7\u6216\u5382\u5546\uFF0C\u663E\u793A\u51FA\u6765\u4F1A\u8BEF\u5BFC\u9009\u578B\u3002"), !loading && d?.inPLM && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 2,
      padding: "0 24px",
      borderBottom: `1px solid ${C.borderLight}`
    }
  }, [["specs", "技术规格"], ["graphics", "eCAD库"], ["suppliers", "供应商报价"], ["downloads", "资源下载"], ["refs", "参考设计"]].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    style: {
      padding: "11px 16px",
      border: "none",
      borderBottom: `2px solid ${tab === k ? C.green : "transparent"}`,
      background: "none",
      color: tab === k ? C.green : C.textSec,
      fontSize: 13,
      fontWeight: tab === k ? 700 : 400,
      cursor: "pointer"
    }
  }, l, k === "suppliers" && offers.length > 0 ? ` (${offers.length})` : "", k === "downloads" && downloads.length > 0 ? ` (${downloads.length})` : "", k === "refs" && refs.length > 0 ? ` (${refs.length})` : ""))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 24px"
    }
  }, tab === "specs" && (params.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,1fr)",
      gap: "0 24px"
    }
  }, params.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "9px 0",
      borderBottom: `1px solid ${C.borderLight}`,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.textSec
    }
  }, p.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'DM Mono',monospace",
      fontWeight: 600,
      textAlign: "right"
    }
  }, fmtVal(p.value, p.unit))))) : /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: C.textMute
    }
  }, "\u6682\u65E0\u53C2\u6570\u6570\u636E")), tab === "graphics" && /*#__PURE__*/React.createElement(GraphicsPanel, {
    d: d,
    pn: pn
  }), tab === "suppliers" && /*#__PURE__*/React.createElement("div", null, offers.length ? /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: C.greenLight
    }
  }, ["供应商", "库存", "起订量", "阶梯价格", "交期", ""].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      padding: "9px 10px",
      textAlign: "left",
      fontSize: 11,
      color: C.green,
      borderBottom: `1px solid ${C.greenMid}`
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, offers.map((o, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: i % 2 ? {
      background: C.bgSoft
    } : {}
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "9px 10px",
      fontWeight: 600
    }
  }, o.vendor), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "9px 10px",
      fontFamily: "'DM Mono',monospace",
      color: o.stock > 0 ? C.green : "#c0392b"
    }
  }, o.stock != null ? o.stock.toLocaleString() : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "9px 10px",
      fontFamily: "'DM Mono',monospace"
    }
  }, o.moq ?? "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "9px 10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, (o.tiers || []).map((t, j) => /*#__PURE__*/React.createElement("span", {
    key: j,
    style: {
      fontSize: 11,
      fontFamily: "'DM Mono',monospace"
    }
  }, t.qty, "+:", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.green
    }
  }, "$", t.price))))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "9px 10px"
    }
  }, o.leadTimeDays ? `${o.leadTimeDays}天` : "—"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "9px 10px"
    }
  }, o.url && /*#__PURE__*/React.createElement("a", {
    href: o.url,
    target: "_blank",
    rel: "noreferrer",
    style: {
      color: C.indigo,
      fontSize: 11
    }
  }, "\u67E5\u770B \u2197")))))) : /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: C.textMute
    }
  }, m?.source === "ai_estimate" ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: 8
    }
  }, "\u26A0 \u6682\u672A\u63A5\u5165\u5206\u9500\u5546 API\uFF0C\u4EE5\u4E0B\u4E3A AI \u4F30\u7B97\uFF0C\u4EC5\u4F9B\u53C2\u8003\uFF1A"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 14px",
      borderRadius: 8,
      background: C.amberBg,
      border: "1px solid #f0dca0",
      color: "#854f0b"
    }
  }, m.priceUSD1 != null && /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 14
    }
  }, "1\u7247\u2248", /*#__PURE__*/React.createElement("b", null, "$", m.priceUSD1)), m.priceUSD100 != null && /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 14
    }
  }, "100\u7247\u2248", /*#__PURE__*/React.createElement("b", null, "$", m.priceUSD100)), /*#__PURE__*/React.createElement("span", null, "\u4F9B\u8D27: ", /*#__PURE__*/React.createElement("b", null, m.stock)), m.channels?.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 14
    }
  }, "\u6E20\u9053: ", m.channels.join("、")))) : "暂无供应商报价数据")), tab === "downloads" && (downloads.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 8
    }
  }, downloads.map((f, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: f.url,
    target: "_blank",
    rel: "noreferrer",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      textDecoration: "none",
      color: C.text,
      background: "#fff"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, f.type === "datasheet" ? "📄" : f.type === "symbol" ? "🔣" : f.type === "footprint" ? "📐" : "🧊"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 13,
      fontWeight: 600
    }
  }, f.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.indigo,
      fontSize: 12
    }
  }, "\u4E0B\u8F7D \u2193")))) : /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: C.textMute
    }
  }, "\u6682\u65E0\u53EF\u4E0B\u8F7D\u8D44\u6E90")), tab === "refs" && (refs.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 10
    }
  }, refs.map((r, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: r.link || "#",
    target: "_blank",
    rel: "noreferrer",
    style: {
      display: "flex",
      gap: 12,
      padding: "12px 14px",
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      textDecoration: "none",
      color: C.text
    }
  }, r.image && /*#__PURE__*/React.createElement("img", {
    src: r.image,
    alt: "",
    style: {
      width: 64,
      height: 64,
      objectFit: "cover",
      borderRadius: 6
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: C.green
    }
  }, r.name), r.description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: C.textMute,
      marginTop: 3
    }
  }, r.description)), r.link && /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.indigo,
      fontSize: 12,
      alignSelf: "center"
    }
  }, "\u67E5\u770B \u2197")))) : /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: C.textMute
    }
  }, "\u6682\u65E0\u53C2\u8003\u8BBE\u8BA1"))))));
}

// ═══ 封装变体确认页 ═══
function VariantPicker({
  base,
  onPick,
  onSkip,
  onBack
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 620,
      margin: "50px auto",
      padding: "0 24px",
      animation: "fadeUp 0.4s ease both"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 700,
      color: C.text,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'DM Mono',monospace",
      color: C.green
    }
  }, base.partNumber), " \u5B58\u5728\u591A\u4E2A\u5C01\u88C5/\u8BA2\u8D27\u53D8\u4F53"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: C.textMute
    }
  }, "\u8BF7\u786E\u8BA4\u5177\u4F53\u578B\u53F7\uFF0C\u5C01\u88C5\u4FE1\u606F\u5C06\u7528\u4E8E\u66FF\u4EE3\u5339\u914D")), (base.variants || []).map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    onClick: () => onPick(v),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 18px",
      borderRadius: 10,
      border: `1.5px solid ${C.border}`,
      background: "#fff",
      marginBottom: 10,
      cursor: "pointer",
      transition: "all 0.15s"
    },
    onMouseEnter: e => {
      e.currentTarget.style.borderColor = C.green;
      e.currentTarget.style.background = C.greenLight;
    },
    onMouseLeave: e => {
      e.currentTarget.style.borderColor = C.border;
      e.currentTarget.style.background = "#fff";
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      fontFamily: "'DM Mono',monospace",
      color: C.green
    }
  }, v.pn), v.note && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: C.textMute,
      marginTop: 2
    }
  }, v.note)), v.package && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "4px 12px",
      borderRadius: 6,
      background: C.indigoBg,
      color: C.indigo,
      fontSize: 13,
      fontWeight: 600,
      border: `1px solid ${C.indigoBorder}`,
      fontFamily: "'DM Mono',monospace"
    }
  }, v.package), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.textMute
    }
  }, "\u2192"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onSkip,
    style: {
      flex: 1,
      padding: "11px",
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      background: "#fff",
      color: C.textSec,
      fontSize: 13,
      cursor: "pointer"
    }
  }, "\u8DF3\u8FC7\uFF0C\u76F4\u63A5\u4F7F\u7528 ", base.partNumber, "\uFF08\u4E0D\u9650\u5B9A\u5C01\u88C5\uFF09"), /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      padding: "11px 20px",
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      background: "#fff",
      color: C.textMute,
      fontSize: 13,
      cursor: "pointer"
    }
  }, "\u2190 \u8FD4\u56DE")));
}

// ═══ 首页 ═══
function HomePage({
  onSubmit,
  busy,
  err
}) {
  const [pn, setPn] = useState("");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 640,
      margin: "60px auto",
      padding: "0 24px",
      textAlign: "center",
      animation: "fadeUp 0.5s ease both"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "56",
    height: "56",
    viewBox: "0 0 56 56",
    fill: "none",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "4",
    width: "48",
    height: "48",
    rx: "12",
    stroke: C.green,
    strokeWidth: "1.5",
    fill: C.greenLight
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 28h16M28 20v16",
    stroke: C.green,
    strokeWidth: "2",
    strokeLinecap: "round"
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 28,
      fontWeight: 700,
      color: C.green,
      marginBottom: 8
    }
  }, "\u5143\u5668\u4EF6\u66FF\u4EE3\u6599\u667A\u80FD\u63A8\u8350"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: pn,
    onChange: e => setPn(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && pn.trim()) onSubmit(pn.trim());
    },
    placeholder: "\u8F93\u5165\u539F\u59CB\u5668\u4EF6\u578B\u53F7\uFF0C\u5982 STM32F103C8T6",
    autoFocus: true,
    style: {
      flex: 1,
      padding: "13px 16px",
      borderRadius: 8,
      border: `1.5px solid ${C.border}`,
      fontSize: 15,
      fontFamily: "'DM Mono',monospace"
    }
  }), /*#__PURE__*/React.createElement("button", {
    disabled: busy || !pn.trim(),
    onClick: () => onSubmit(pn.trim()),
    style: {
      padding: "13px 26px",
      borderRadius: 8,
      border: "none",
      background: pn.trim() ? C.green : C.borderLight,
      color: "#fff",
      fontSize: 14,
      fontWeight: 600,
      cursor: pn.trim() ? "pointer" : "not-allowed"
    }
  }, busy ? "查询中…" : "查询参数")), err && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 14px",
      borderRadius: 7,
      background: "#fdeaea",
      border: "1px solid #f5c6c6",
      color: "#a0302a",
      fontSize: 13,
      marginBottom: 12
    }
  }, "\u26A0 ", err), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: C.textMute
    }
  }, "\u5FEB\u901F\u8BD5\u8BD5:\xA0", ["STM32F103C8T6", "LM358", "AMS1117-3.3", "TL431"].map(x => /*#__PURE__*/React.createElement("button", {
    key: x,
    onClick: () => setPn(x),
    style: {
      padding: "3px 9px",
      borderRadius: 5,
      border: `1px solid ${C.border}`,
      background: "#fff",
      color: C.textSec,
      fontSize: 11,
      fontFamily: "'DM Mono',monospace",
      cursor: "pointer",
      marginRight: 4
    }
  }, x))), /*#__PURE__*/React.createElement("div", {
    className: "flow-row",
    style: {
      marginTop: 28,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      flexWrap: "nowrap",
      fontSize: 12,
      color: C.textSec,
      overflowX: "auto",
      paddingBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: FLOW_A
  }, "\u2460 \u672C\u5730\u5E93\u67E5\u53C2\u6570"), /*#__PURE__*/React.createElement("span", {
    style: FLOW_ARROW
  }, "\u2192"), /*#__PURE__*/React.createElement("span", {
    style: FLOW_B
  }, "\u2461 \u8C03\u4F18\u5148\u7EA7/\u7EA6\u675F"), /*#__PURE__*/React.createElement("span", {
    style: FLOW_ARROW
  }, "\u2192"), /*#__PURE__*/React.createElement("span", {
    style: FLOW_C
  }, "\u2462 AI\u63A8\u8350\u5019\u9009"), /*#__PURE__*/React.createElement("span", {
    style: FLOW_ARROW
  }, "\u2192"), /*#__PURE__*/React.createElement("span", {
    style: FLOW_D
  }, "\u2463 \u7B97\u6CD5\u8BC4\u5206\u6DD8\u6C70"), /*#__PURE__*/React.createElement("span", {
    style: FLOW_ARROW
  }, "\u2192"), /*#__PURE__*/React.createElement("span", {
    style: FLOW_E
  }, "\u2464 Top 5")));
}

// ═══ 左栏：参数行（可拖拽 + 点击设约束）═══
function ParamRow({
  p,
  index,
  con,
  onSetCon,
  onDragStart,
  onDragOver,
  onDrop,
  dragging
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(con?.constraintType || "none");
  const [min, setMin] = useState(con?.min ?? "");
  const [max, setMax] = useState(con?.max ?? "");
  const save = () => {
    if (type === "none") onSetCon(p.id, null);else onSetCon(p.id, {
      constraintType: type,
      min: min === "" ? null : min,
      max: max === "" ? null : max
    });
    setOpen(false);
  };
  const hasCon = con && con.constraintType;
  return /*#__PURE__*/React.createElement("div", {
    draggable: true,
    onDragStart: e => onDragStart(e, index),
    onDragOver: e => onDragOver(e, index),
    onDrop: e => onDrop(e, index),
    style: {
      borderRadius: 8,
      border: `1.5px solid ${hasCon ? con.constraintType === "hard" ? "#c0392b60" : C.amber + "80" : C.borderLight}`,
      background: "#fff",
      marginBottom: 6,
      cursor: "grab",
      opacity: dragging === index ? 0.4 : 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setOpen(!open),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "9px 10px",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 24,
      height: 24,
      borderRadius: 5,
      background: C.greenLight,
      color: C.green,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 700,
      fontFamily: "'DM Mono',monospace",
      border: `1px solid ${C.greenMid}`
    }
  }, index + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.textMute,
      fontSize: 13,
      cursor: "grab"
    }
  }, "\u28FF"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, p.name, hasCon && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6,
      fontSize: 10,
      padding: "1px 5px",
      borderRadius: 3,
      background: con.constraintType === "hard" ? "#fdeaea" : C.amberBg,
      color: con.constraintType === "hard" ? "#c0392b" : C.amber
    }
  }, con.constraintType === "hard" ? "硬约束" : "软偏好")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: C.textMute
    }
  }, p.nameEn)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontFamily: "'DM Mono',monospace",
      color: C.textSec,
      whiteSpace: "nowrap"
    }
  }, fmtVal(p.value, p.unit)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: C.textMute
    }
  }, "\u25BE")), open && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px 10px",
      borderTop: `1px dashed ${C.borderLight}`,
      background: C.bgSoft
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 8
    }
  }, [["none", "无约束"], ["hard", "硬约束(不满足即淘汰)"], ["soft", "软偏好(不满足扣分)"]].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setType(v),
    style: {
      padding: "4px 10px",
      borderRadius: 5,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: type === v ? C.green : C.border,
      background: type === v ? C.greenLight : "#fff",
      fontSize: 11,
      cursor: "pointer"
    }
  }, l))), type !== "none" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: C.textSec
    }
  }, "\u8303\u56F4:"), /*#__PURE__*/React.createElement("input", {
    value: min,
    onChange: e => setMin(e.target.value),
    placeholder: "\u6700\u5C0F\u503C",
    style: {
      width: 90,
      padding: "5px 8px",
      borderRadius: 5,
      border: `1px solid ${C.border}`,
      fontSize: 12,
      fontFamily: "'DM Mono',monospace"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.textMute
    }
  }, "~"), /*#__PURE__*/React.createElement("input", {
    value: max,
    onChange: e => setMax(e.target.value),
    placeholder: "\u6700\u5927\u503C",
    style: {
      width: 90,
      padding: "5px 8px",
      borderRadius: 5,
      border: `1px solid ${C.border}`,
      fontSize: 12,
      fontFamily: "'DM Mono',monospace"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: C.textMute
    }
  }, p.unit)), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      padding: "5px 16px",
      borderRadius: 5,
      border: "none",
      background: C.green,
      color: "#fff",
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "\u786E\u5B9A")));
}

// ═══ 结果卡片 ═══
function MarketStrip({
  rec,
  market
}) {
  const m = rec.market || market?.[rec.partNumber];
  if (!m || m.source === "unavailable") return null;
  const stockColor = {
    "有货": C.green,
    "充足": C.green,
    "一般": C.amber,
    "紧张": "#c2610c",
    "缺货": "#c0392b",
    "停产风险": "#c0392b"
  }[m.stock] || C.textMute;
  const d = rec.costDelta,
    dp = rec.costDeltaPct;
  const cheaper = d != null && d < 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      padding: "8px 10px",
      borderRadius: 7,
      background: C.bgSoft,
      border: `1px solid ${C.borderLight}`,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: C.textSec
    }
  }, "\uD83D\uDCB0"), m.priceUSD1 != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'DM Mono',monospace"
    }
  }, "1\u7247 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.green
    }
  }, "$", m.priceUSD1)), m.priceUSD100 != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'DM Mono',monospace"
    }
  }, "100\u7247 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.green
    }
  }, "$", m.priceUSD100)), d != null && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "2px 8px",
      borderRadius: 4,
      fontWeight: 700,
      fontFamily: "'DM Mono',monospace",
      background: cheaper ? C.greenLight : "#fdeaea",
      color: cheaper ? C.green : "#c0392b",
      border: `1px solid ${cheaper ? C.greenMid : "#f5c6c6"}`
    }
  }, cheaper ? "↓省" : "↑贵", " $", Math.abs(d).toFixed(2), dp != null ? ` (${dp > 0 ? "+" : ""}${dp}%)` : ""), /*#__PURE__*/React.createElement("span", null, "\u4F9B\u8D27 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: stockColor
    }
  }, m.stock), m.stockQty ? ` ${m.stockQty.toLocaleString()}` : ""), m.channels?.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.textMute
    }
  }, m.channels.join("、")), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontSize: 10,
      padding: "1px 6px",
      borderRadius: 3,
      background: m.source === "distributor_api" ? C.greenLight : C.amberBg,
      color: m.source === "distributor_api" ? C.green : C.amber,
      border: `1px solid ${m.source === "distributor_api" ? C.greenMid : "#f0dca0"}`
    }
  }, m.source === "distributor_api" ? "实时报价 ✓" : "AI估算 ⚠"));
}

/** 被淘汰候选的一行：展示原因 + 四项指标，前 5 个可展开逐参数对比 */
function EliminatedRow({
  item,
  index
}) {
  const d = item.detail || null;
  const ps0 = d && d.paramScores || [];
  const isTop5 = index < 5;
  const showDetail = isTop5 && ps0.length > 0;
  const nOk = ps0.filter(x => x.known && x.score >= 70).length;
  const nBad = ps0.filter(x => x.known && !(x.score >= 70)).length;
  const nNone = ps0.filter(x => !x.known).length;
  const sorted = [...ps0].sort((a, b) => {
    const rank = x => !x.known ? 2 : x.score >= 70 ? 1 : 0; // 不满足的排最前，用户最关心哪里不合适
    return rank(a) - rank(b) || (a.score || 0) - (b.score || 0);
  });
  const metrics = [["技术兼容", d && d.technical], ["证据覆盖", d && d.evidenceCoverage, "%"], ["来源可信", d && d.sourceConfidence, "%"], ["结论可信", d && d.confidence]].filter(x => x[1] !== null && x[1] !== undefined);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 0",
      borderBottom: `1px solid ${C.borderLight}`,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      alignItems: "baseline",
      flexWrap: "wrap"
    }
  }, isTop5 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: "1px 6px",
      borderRadius: 3,
      background: C.bgSoft,
      border: `1px solid ${C.borderLight}`,
      color: C.textMute,
      fontFamily: "'DM Mono',monospace"
    }
  }, "#", index + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'DM Mono',monospace",
      fontWeight: 600,
      color: C.textSec,
      minWidth: 130
    }
  }, item.partNumber), item.manufacturer && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: C.textMute
    }
  }, item.manufacturer), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#c0392b",
      flex: 1,
      minWidth: 180
    }
  }, item.reason)), metrics.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      marginTop: 5,
      fontSize: 11,
      color: C.textMute,
      flexWrap: "wrap"
    }
  }, metrics.map((m, k) => /*#__PURE__*/React.createElement("span", {
    key: k
  }, m[0], " ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.textSec
    }
  }, m[1], m[2] || "")))), showDetail && /*#__PURE__*/React.createElement("details", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("summary", {
    style: {
      cursor: "pointer",
      fontSize: 11,
      color: C.indigo
    }
  }, "\u67E5\u770B\u9010\u53C2\u6570\u5BF9\u6BD4\uFF08", nOk, " \u9879\u6EE1\u8DB3 \xB7 ", nBad, " \u9879\u4E0D\u8DB3 \xB7 ", nNone, " \u9879\u65E0\u6570\u636E\uFF09"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      display: "grid",
      gap: 2
    }
  }, sorted.map((ps, j) => {
    const state = !ps.known ? "none" : ps.score >= 70 ? "ok" : "bad";
    const bg = state === "ok" ? C.greenLight : state === "bad" ? "#fdeaea" : C.bgSoft;
    const col = state === "ok" ? C.green : state === "bad" ? "#c0392b" : C.textMute;
    return /*#__PURE__*/React.createElement("div", {
      key: j,
      style: {
        display: "flex",
        gap: 10,
        alignItems: "baseline",
        padding: "3px 8px",
        borderRadius: 4,
        background: bg,
        fontSize: 11
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 104,
        color: C.textSec
      }
    }, ps.paramName), /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 104,
        fontFamily: "'DM Mono',monospace",
        color: C.textMute
      }
    }, fmtVal(ps.origValue, ps.origUnit)), /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.textMute
      }
    }, "\u2192"), /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 104,
        fontFamily: "'DM Mono',monospace",
        fontWeight: 600,
        color: col
      }
    }, ps.known ? fmtVal(ps.value, ps.unit) : "无数据"), /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 32,
        textAlign: "right",
        fontFamily: "'DM Mono',monospace",
        color: col
      }
    }, ps.known ? ps.score : "—"), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        color: col
      }
    }, ps.comment, ps.better ? " ⬆ 优于原型号" : ""));
  }))));
}
function ResultCard({
  rec,
  index,
  market,
  pending,
  onShowDetail
}) {
  const [expanded, setExpanded] = useState(index === 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 10,
      border: `1.5px solid ${C.border}`,
      background: "#fff",
      overflow: "hidden",
      marginBottom: 14,
      animation: "fadeUp 0.4s ease both",
      animationDelay: `${index * 0.06}s`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 18px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      cursor: "pointer"
    },
    onClick: () => setExpanded(!expanded)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: C.greenLight,
      color: C.green,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 700,
      fontFamily: "'DM Mono',monospace",
      border: `1px solid ${C.greenMid}`
    }
  }, "#", index + 1), /*#__PURE__*/React.createElement(ScoreRing, {
    score: rec.confidence ?? rec.overallScore
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement(LevelBadge, {
    level: rec.replacementLevel
  }), /*#__PURE__*/React.createElement("span", {
    onClick: e => {
      e.stopPropagation();
      onShowDetail(rec.partNumber, rec);
    },
    style: {
      fontSize: 18,
      fontWeight: 700,
      fontFamily: "'DM Mono',monospace",
      color: C.green,
      cursor: "pointer",
      textDecoration: "underline dotted",
      textUnderlineOffset: 3
    },
    title: "\u70B9\u51FB\u67E5\u770B\u8BE6\u60C5\u548C\u4F9B\u5E94\u5546\u91C7\u8D2D\u4FE1\u606F"
  }, rec.partNumber, " \uD83D\uDD0D"), rec.isPreferred && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "2px 7px",
      borderRadius: 4,
      background: C.amberBg,
      color: C.amber,
      fontSize: 11,
      fontWeight: 600,
      border: "1px solid #f0dca0"
    }
  }, "\u2B50 \u4F18\u9009"), rec.inPLM && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "2px 7px",
      borderRadius: 4,
      background: C.indigoBg,
      color: C.indigo,
      fontSize: 11,
      fontWeight: 600,
      border: `1px solid ${C.indigoBorder}`
    }
  }, "\uD83D\uDCE6 ezPLM"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "2px 7px",
      borderRadius: 4,
      background: C.bgSoft,
      color: C.textMute,
      fontSize: 10,
      border: `1px solid ${C.borderLight}`
    }
  }, rec.dataSource)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: C.textMute
    }
  }, rec.manufacturer), pending && rec.pendingReason && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: C.amber,
      marginTop: 3
    }
  }, "\u26A0 ", rec.pendingReason), rec.description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: C.textMute,
      marginTop: 2
    }
  }, rec.description, rec.dataSource === "AI搜索" && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6,
      fontSize: 10,
      padding: "1px 5px",
      borderRadius: 3,
      background: C.amberBg,
      color: C.amber,
      border: "1px solid #f0dca0"
    }
  }, "\u63CF\u8FF0\u6765\u81EAAI\uFF0C\u8BF7\u6838\u5BF9"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: C.textMute,
      transform: expanded ? "rotate(180deg)" : "rotate(0)",
      transition: "transform 0.2s"
    }
  }, "\u25BE")), rec.technical != null && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 18px 10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, [["技术兼容", rec.technical], ["证据覆盖", rec.evidenceCoverage != null ? rec.evidenceCoverage + "%" : "—"], ["来源可信", rec.sourceConfidence != null ? rec.sourceConfidence + "%" : "—"], ["结论可信", rec.confidence]].map(([l, v], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      padding: "7px 8px",
      borderRadius: 7,
      background: i === 3 ? C.greenLight : C.bgSoft,
      border: `1px solid ${i === 3 ? C.greenMid : C.borderLight}`,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      fontFamily: "'DM Mono',monospace",
      color: i === 3 ? C.green : C.text
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: C.textMute,
      marginTop: 1
    }
  }, l)))), rec.replacementLevel?.level === "P2" && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 11,
      color: "#854f0b",
      background: C.amberBg,
      border: "1px solid #f0dca0",
      borderRadius: 6,
      padding: "5px 8px"
    }
  }, "\u26A0 \u53C2\u6570\u9AD8\u5EA6\u5339\u914D\uFF0C\u4F46\u5F15\u811A\u6620\u5C04\u5C1A\u672A\u9A8C\u8BC1 \u2014 \u9700\u4EBA\u5DE5\u6838\u5BF9\u5F15\u811A\u540E\u65B9\u53EF\u5224\u5B9A\"\u53EF\u76F4\u63A5\u66FF\u6362\""), rec.replacementLevel?.level === "P0" && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 11,
      color: "#7a5b00",
      background: "#f5f0e0",
      border: "1px solid #e0d4a0",
      borderRadius: 6,
      padding: "5px 8px"
    }
  }, "\u2139 \u8BC1\u636E\u8986\u76D6\u7387\u8FC7\u4F4E\uFF0C\u6570\u636E\u4E0D\u8DB3\u4EE5\u5224\u65AD\u517C\u5BB9\u6027"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(MarketStrip, {
    rec: rec,
    market: market
  }))), expanded && (rec.paramScores || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 14px 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 600,
      color: C.text
    }
  }, "\uD83D\uDD2C \u53C2\u6570\u5BF9\u6BD4\u8BE6\u60C5"), (rec.extraParams || []).length > 0 && /*#__PURE__*/React.createElement("details", {
    style: {
      margin: "4px 10px 8px",
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("summary", {
    style: {
      cursor: "pointer",
      color: C.textMute
    }
  }, "\u8BE5\u5019\u9009\u53E6\u6709 ", rec.extraParams.length, " \u9879\u53C2\u6570\u672A\u53C2\u4E0E\u5BF9\u6BD4\uFF08\u539F\u578B\u53F7\u65E0\u5BF9\u5E94\u9879\uFF09"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
      gap: "2px 12px",
      marginTop: 6
    }
  }, rec.extraParams.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8,
      color: C.textSec
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, p.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'DM Mono',monospace"
    }
  }, p.value))))), rec.paramScores.map(ps => /*#__PURE__*/React.createElement("div", {
    key: ps.paramId,
    style: {
      display: "grid",
      gridTemplateColumns: "110px 1fr 40px 120px auto",
      gap: 8,
      alignItems: "center",
      padding: "6px 10px",
      borderRadius: 6,
      background: ps.known === false ? "#f5f5f5" : scoreBg(ps.score),
      fontSize: 12,
      marginBottom: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.textSec,
      fontSize: 11
    }
  }, ps.paramName), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'DM Mono',monospace",
      fontSize: 12
    }
  }, ps.value, ps.unit && !String(ps.value).includes(ps.unit) ? ` ${ps.unit}` : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: ps.known === false ? C.textMute : scoreColor(ps.score),
      fontFamily: "'DM Mono',monospace",
      textAlign: "center"
    }
  }, ps.known === false ? "—" : ps.score), /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.textMute,
      fontSize: 11
    }
  }, ps.comment), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(SourceTag, {
    source: ps.source,
    sourceLabel: ps.sourceLabel
  }))))));
}

// ═══ 对比表视图 ═══
function CompareTable({
  original,
  recs
}) {
  const params = original.parameters || [];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto",
      borderRadius: 10,
      border: `1.5px solid ${C.border}`,
      background: "#fff"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 12,
      minWidth: 640
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: C.greenLight
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "9px 12px",
      textAlign: "left",
      fontSize: 12,
      color: C.green,
      borderBottom: `1px solid ${C.greenMid}`,
      position: "sticky",
      left: 0,
      background: C.greenLight
    }
  }, "\u53C2\u6570"), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "9px 12px",
      textAlign: "left",
      fontSize: 12,
      color: C.textSec,
      borderBottom: `1px solid ${C.greenMid}`
    }
  }, original.partNumber, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 400
    }
  }, "\u539F\u578B\u53F7")), recs.map(r => /*#__PURE__*/React.createElement("th", {
    key: r.partNumber,
    style: {
      padding: "9px 12px",
      textAlign: "left",
      fontSize: 12,
      color: C.green,
      borderBottom: `1px solid ${C.greenMid}`
    }
  }, r.partNumber, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 400,
      color: scoreColor(r.confidence)
    }
  }, "\u53EF\u4FE1", r.confidence))))), /*#__PURE__*/React.createElement("tbody", null, params.map((p, i) => /*#__PURE__*/React.createElement("tr", {
    key: p.id,
    style: i % 2 ? {
      background: C.bgSoft
    } : {}
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "7px 12px",
      fontWeight: 600,
      fontSize: 11,
      color: C.textSec,
      position: "sticky",
      left: 0,
      background: i % 2 ? C.bgSoft : "#fff"
    }
  }, p.name), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "7px 12px",
      fontFamily: "'DM Mono',monospace",
      fontSize: 11
    }
  }, fmtVal(p.value, p.unit)), recs.map(r => {
    const ps = (r.paramScores || []).find(x => x.paramId === p.id);
    return /*#__PURE__*/React.createElement("td", {
      key: r.partNumber,
      style: {
        padding: "7px 12px",
        fontFamily: "'DM Mono',monospace",
        fontSize: 11,
        background: ps ? ps.known === false ? "#f5f5f5" : scoreBg(ps.score) : undefined
      }
    }, ps ? `${ps.value}${ps.unit && !String(ps.value).includes(ps.unit) ? " " + ps.unit : ""}` : "—", ps && ps.known !== false && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        fontWeight: 700,
        color: scoreColor(ps.score)
      }
    }, ps.score));
  }))))));
}

// ═══ 工作台（双栏）═══
function Workbench({
  original,
  demoNote,
  onBack,
  onSwitchVariant
}) {
  const isNAv = v => v == null || /^n\/?a$/i.test(String(v).trim());
  const [params, setParams] = useState((original.parameters || []).filter(p => !isNAv(p.value)).slice(0, 10));
  const [constraints, setConstraints] = useState({});
  const [mfrs, setMfrs] = useState([]);
  const [mfrInput, setMfrInput] = useState("");
  const [mode, setMode] = useState("funcCompat");
  const application = "generic"; // 应用领域筛选已移除；后端仍保留该维度供 ezPLM 走 API 调用
  const [showVariants, setShowVariants] = useState(false);
  const [orderSource, setOrderSource] = useState("default"); // default | user_override
  const [procurement, setProcurement] = useState({
    region: "CN",
    quantity: 100,
    packaging: "any",
    currency: "USD",
    inStockOnly: true
  });
  const [reorderNote, setReorderNote] = useState("");
  const [phase, setPhase] = useState("idle"); // idle|loading|done
  const [result, setResult] = useState(null);
  const [note, setNote] = useState(demoNote || "");
  const [view, setView] = useState("cards");
  const [detailPN, setDetailPN] = useState(null);
  const [detailRec, setDetailRec] = useState(null);
  const onShowSelf = () => {
    setDetailPN(original.partNumber);
    setDetailRec({
      manufacturer: original.manufacturer
    });
  };
  const [market, setMarket] = useState(null); // {PN: {priceUSD1,stock,channels,source}}
  const [dragging, setDragging] = useState(null);
  const dragFrom = useRef(null);
  const onDragStart = (e, i) => {
    dragFrom.current = i;
    setDragging(i);
  };
  const onDragOver = (e, i) => {
    e.preventDefault();
  };
  const onDrop = (e, i) => {
    e.preventDefault();
    const from = dragFrom.current;
    if (from == null || from === i) return void setDragging(null);
    const next = [...params];
    const [m] = next.splice(from, 1);
    next.splice(i, 0, m);
    setParams(next);
    setDragging(null);
    dragFrom.current = null;
    setOrderSource("user_override");
    setReorderNote("优先级已调整，点「重新推荐」按新顺序重新检索候选");
  };
  const setCon = (pid, c) => setConstraints(prev => {
    const n = {
      ...prev
    };
    if (c) n[pid] = c;else delete n[pid];
    return n;
  });
  const addMfr = () => {
    const v = mfrInput.trim();
    if (!v) {
      setMfrInput("");
      return;
    }
    const key = canonMfr(v);
    if (mfrs.some(x => canonMfr(x) === key)) {
      setMfrInput("");
      return;
    } // 大小写/别名去重
    setMfrs([...mfrs, v]);
    setMfrInput("");
  };
  const mfrSuggest = mfrInput ? POPULAR_MFRS.filter(m => m.toLowerCase().includes(mfrInput.toLowerCase()) && !mfrs.includes(m)).slice(0, 5) : [];
  const fetchMarket = async pns => {
    setMarket(null);
    try {
      const r = await fetch("/api/v2/market", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          partNumbers: pns
        })
      });
      const d = await r.json().catch(() => null);
      if (d && d.success) setMarket(d.parts || {});else setMarket({});
    } catch (e) {
      setMarket({});
    }
  };
  const ERR_TEXT = {
    NO_VERIFIED_CANDIDATES: "没有找到满足当前模式与约束的已验证候选",
    NO_CANDIDATE_DATA: "候选型号均查不到参数数据，无法比较",
    PIN_EVIDENCE_MISSING: "该模式需要引脚映射证据，当前候选均无法验证引脚",
    PART_UNVERIFIED: "原型号未经权威来源验证，无法推荐",
    VARIANT_NOT_RESOLVED: "未能确定具体订货型号，请先选择封装变体",
    INVALID_REQUEST: "请求参数有误",
    UPSTREAM_TIMEOUT: "上游服务超时",
    UPSTREAM_UNAVAILABLE: "上游服务不可用",
    AI_INVALID_RESPONSE: "AI 返回格式异常",
    RATE_LIMITED: "调用过于频繁",
    INTERNAL_ERROR: "服务内部错误"
  };
  const runRecommend = async () => {
    if (phase === "loading") return; // 防重复点击造成并发重复请求
    setPhase("loading");
    setNote("");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000); // 可配置超时，超时后允许安全重试
    try {
      const r = await fetch("/api/v2/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: ctl.signal,
        body: JSON.stringify({
          partNumber: original.partNumber,
          mode,
          application,
          preferredManufacturers: mfrs,
          constraints,
          priorityOrder: params.map(p => p.id),
          orderSource,
          procurement: mode === "lowCost" ? procurement : undefined,
          original: original._dataPath === "demo" ? undefined : original
        })
      });
      clearTimeout(timer);
      const ct = r.headers.get("content-type") || "";
      const d = ct.includes("json") ? await r.json().catch(() => null) : null;

      // 后端会把未经权威来源验证的候选放进 pendingVerification，
      // 只检查 recommendations 会把这种"有结果但需核验"误判成失败（线上显示"推荐失败(HTTP 200)"）
      if (r.ok && d && d.success && (d.recommendations?.length || d.pendingVerification?.length)) {
        setResult(d);
        setPhase("done");
        if (d.onlyPending) setNote(d.notice || "未找到有权威来源支撑的候选，以下为待核验候选");
        return;
      }
      if (original.partNumber === "STM32F103C8T6" && original._dataPath === "demo") {
        setResult({
          recommendations: MOCK_RECS,
          eliminated: []
        });
        setNote("演示模式数据");
        setPhase("done");
        return;
      }
      // 业务错误：error 是对象，必须逐字段读取，不能直接拼进模板串（否则显示 [object Object]）
      const e = d && d.error;
      if (typeof e === "string" && e) {
        // 旧格式：error 为字符串
        setNote(`推荐失败：${e}`);
        if (Array.isArray(d.eliminated) && d.eliminated.length) {
          setResult({
            recommendations: [],
            pendingVerification: [],
            eliminated: d.eliminated,
            _noCandidates: true
          });
          setPhase("done");
        } else {
          setResult(null);
          setPhase("idle");
        }
        return;
      }
      if (e && typeof e === "object") {
        const n = e.details?.eliminatedCount;
        // ERR_TEXT 只是分类文案；后端 message 与 hint 才说明具体原因，
        // 之前 `ERR_TEXT[code]||message` 把 message 整个吞掉，
        // 线上表现就是一句无信息的"服务内部错误 · 可重试"
        const label = ERR_TEXT[e.code] || "推荐失败";
        const detail = e.message && e.message !== label ? `：${e.message}` : "";
        const hint = e.details?.hint ? ` 建议：${e.details.hint}` : "";
        setNote(`${label}${detail}` + `${typeof n === "number" ? `（已排除 ${n} 个候选，见下方淘汰列表）` : ""}` + `${hint}` + `${e.retryable ? " · 可重试" : ""} · ${e.code || ""} · ${e.requestId || ""}`);
        // 有淘汰明细时必须进入 done 阶段，否则结果区（含淘汰列表）整块不渲染，
        // 用户只看到"见下方淘汰列表"而下方空白
        if (e.details?.eliminated?.length) {
          setResult({
            recommendations: [],
            pendingVerification: [],
            eliminated: e.details.eliminated,
            pipeline: e.details.pipeline,
            _noCandidates: true
          });
          setPhase("done");
          return;
        }
        setResult(null);
      } else {
        // 走到这里说明响应既不是成功结构、也没有 error 对象。
        // 必须把实际收到的结构说清楚，否则用户只看到"推荐失败(HTTP 200)"无从排查。
        const shape = d ? [`success=${JSON.stringify(d.success)}`, `recommendations=${Array.isArray(d.recommendations) ? d.recommendations.length : "无此字段"}`, `pendingVerification=${Array.isArray(d.pendingVerification) ? d.pendingVerification.length : "无此字段"}`, `eliminated=${Array.isArray(d.eliminated) ? d.eliminated.length : "无此字段"}`, d.requestId ? `requestId=${d.requestId}` : ""].filter(Boolean).join(" · ") : "响应非 JSON";
        setNote(`后端返回了无法识别的响应（HTTP ${r.status}）：${shape}`);
        // 有淘汰列表就展示，至少能看到为什么没候选
        if (Array.isArray(d?.eliminated) && d.eliminated.length) {
          setResult({
            recommendations: [],
            pendingVerification: [],
            eliminated: d.eliminated,
            pipeline: d.pipeline,
            _noCandidates: true
          });
          setPhase("done");
        } else setResult(null);
        console.warn("[recommend] 未识别的响应结构:", d);
      }
      setPhase("idle");
    } catch (err) {
      clearTimeout(timer);
      setNote(err.name === "AbortError" ? "推荐超时（45 秒）。可点击重试；若持续超时，建议缩小约束范围或稍后再试" : `无法连接后端：${err.message || "网络错误"}`);
      setResult(null);
      setPhase("idle");
    }
  };

  // ── 导出：必须与页面一致（ALT-014）──
  // 旧实现只写 recommendations，0 个正式推荐时导出空表，
  // 待核验候选、淘汰摘要、查询条件、版本与免责声明全部缺失。
  const buildExportModel = () => {
    const recs = result?.recommendations || [];
    const pend = result?.pendingVerification || [];
    const elim = result?.eliminated || [];
    return {
      meta: {
        appVersion: APP_VERSION,
        generatedAt: new Date().toISOString(),
        requestId: result?.requestId || "",
        originalPart: original.partNumber,
        originalManufacturer: original.manufacturer || "",
        matchType: original._matchType || "exact",
        requestedMpn: original.requestedMpn || original.partNumber,
        mode,
        modeLabel: (SUB_MODES.find(m => m.id === mode) || {}).label || mode,
        application,
        applicationLabel: (APPLICATIONS.find(a => a.code === application) || {}).label || application,
        orderSource,
        preferredManufacturers: mfrs,
        procurement: mode === "lowCost" ? procurement : null
      },
      constraints: params.filter(p => constraints[p.id]?.constraintType && constraints[p.id].constraintType !== "none").map(p => ({
        param: p.name,
        type: constraints[p.id].constraintType,
        min: constraints[p.id].min ?? "",
        max: constraints[p.id].max ?? "",
        options: (constraints[p.id].options || []).join("/")
      })),
      priorityOrder: params.map((p, i) => ({
        rank: i + 1,
        param: p.name,
        value: fmtVal(p.value, p.unit)
      })),
      recommendations: recs,
      pendingVerification: pend,
      eliminated: elim,
      noFormalReason: recs.length ? "" : result?.notice || "没有候选同时满足『有权威来源确认』与『所有硬约束可验证』两项要求"
    };
  };
  const DISCLAIMER = "本报告由 AltPart Pro 自动生成，用于替代料候选探索与证据辅助。" + "标记为『待核验』的候选缺少权威来源确认或存在未知硬约束，不构成替代结论。" + "任何替代决策须经工程师核对原厂 datasheet 后确认。";
  const exportMD = () => {
    if (!result) return;
    const m = buildExportModel();
    const L = [];
    L.push(`# ${m.meta.originalPart} 替代料推荐报告`, "");
    L.push(`- 生成时间：${m.meta.generatedAt}`);
    L.push(`- 工具版本：AltPart Pro v${m.meta.appVersion}`);
    if (m.meta.requestId) L.push(`- 请求编号：${m.meta.requestId}`);
    L.push(`- 原型号：${m.meta.originalPart}${m.meta.originalManufacturer ? `（${m.meta.originalManufacturer}）` : ""}`);
    if (m.meta.requestedMpn !== m.meta.originalPart) L.push(`- ⚠ 用户输入 ${m.meta.requestedMpn}，实际匹配 ${m.meta.originalPart}（匹配类型：${m.meta.matchType}）`);
    L.push(`- 替代模式：${m.meta.modeLabel} · 应用场景：${m.meta.applicationLabel}`);
    if (m.meta.preferredManufacturers.length) L.push(`- 优选厂商：${m.meta.preferredManufacturers.join("、")}`);
    if (m.meta.procurement) L.push(`- 采购条件：${m.meta.procurement.region} · ${m.meta.procurement.quantity} 片 · ${m.meta.procurement.packaging} · ${m.meta.procurement.currency}${m.meta.procurement.inStockOnly ? " · 仅现货" : ""}`);
    L.push("");
    L.push("## 参数优先级", "");
    L.push("| 排序 | 参数 | 原型号值 |", "|---|---|---|");
    m.priorityOrder.forEach(p => L.push(`| ${p.rank} | ${p.param} | ${p.value} |`));
    if (m.constraints.length) {
      L.push("", "## 约束条件", "", "| 参数 | 类型 | 最小 | 最大 | 可选值 |", "|---|---|---|---|---|");
      m.constraints.forEach(c => L.push(`| ${c.param} | ${c.type === "hard" ? "硬约束" : "软偏好"} | ${c.min} | ${c.max} | ${c.options} |`));
    }
    L.push("", `## 正式推荐（${m.recommendations.length}）`, "");
    if (m.recommendations.length) {
      L.push("| # | 型号 | 厂商 | 等级 | 技术兼容 | 证据覆盖 | 来源可信 | 结论可信 | 价格 |", "|---|---|---|---|---|---|---|---|---|");
      m.recommendations.forEach((r, i) => L.push(`| ${i + 1} | ${r.partNumber} | ${r.manufacturer} | ${r.replacementLevel.level} ${r.replacementLevel.label} | ${r.technical ?? ""} | ${r.evidenceCoverage ?? ""}% | ${r.sourceConfidence ?? ""}% | ${r.confidence ?? r.overallScore} | ${r.market?.priceUSD100 ?? r.market?.priceUSD1 ?? "—"} |`));
    } else {
      L.push(`> 无正式推荐。原因：${m.noFormalReason}`);
    }
    L.push("", `## 待核验候选（${m.pendingVerification.length}）`, "");
    if (m.pendingVerification.length) {
      L.push("> ⚠ 以下候选不构成替代结论，需人工核对 datasheet 后方可采用。", "");
      L.push("| # | 型号 | 厂商 | 待核验原因 | 技术兼容 | 证据覆盖 | 结论可信 |", "|---|---|---|---|---|---|---|");
      m.pendingVerification.forEach((r, i) => L.push(`| ${i + 1} | ${r.partNumber} | ${r.manufacturer} | ${(r.pendingReason || "").replace(/\|/g, "／")} | ${r.technical ?? ""} | ${r.evidenceCoverage ?? ""}% | ${r.confidence ?? r.overallScore} |`));
    } else L.push("> 无");
    L.push("", `## 已排除候选（${m.eliminated.length}）`, "");
    if (m.eliminated.length) {
      L.push("| 型号 | 厂商 | 排除原因 |", "|---|---|---|");
      m.eliminated.forEach(e => L.push(`| ${e.partNumber} | ${e.manufacturer || ""} | ${(e.reason || "").replace(/\|/g, "／")} |`));
    } else L.push("> 无");
    L.push("", "---", "", `> ${DISCLAIMER}`);
    downloadText(`${m.meta.originalPart}_替代推荐.md`, "\uFEFF" + L.join("\n"), "text/markdown;charset=utf-8");
  };
  const exportCSV = () => {
    if (!result) return;
    const m = buildExportModel();
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [];
    rows.push(["# AltPart Pro 替代料推荐报告"].map(q).join(","));
    rows.push(["# 生成时间", m.meta.generatedAt].map(q).join(","));
    rows.push(["# 工具版本", `v${m.meta.appVersion}`].map(q).join(","));
    rows.push(["# 请求编号", m.meta.requestId].map(q).join(","));
    rows.push(["# 原型号", m.meta.originalPart, m.meta.originalManufacturer].map(q).join(","));
    rows.push(["# 替代模式", m.meta.modeLabel, "应用场景", m.meta.applicationLabel].map(q).join(","));
    if (m.meta.procurement) rows.push(["# 采购条件", m.meta.procurement.region, m.meta.procurement.quantity, m.meta.procurement.packaging, m.meta.procurement.currency].map(q).join(","));
    if (!m.recommendations.length) rows.push(["# 无正式推荐原因", m.noFormalReason].map(q).join(","));
    rows.push("");
    rows.push(["分类", "型号", "厂商", "等级", "技术兼容", "证据覆盖(%)", "来源可信(%)", "结论可信", "单价USD", "供货", "说明"].map(q).join(","));
    m.recommendations.forEach(r => rows.push(["正式推荐", r.partNumber, r.manufacturer, `${r.replacementLevel.level} ${r.replacementLevel.label}`, r.technical ?? "", r.evidenceCoverage ?? "", r.sourceConfidence ?? "", r.confidence ?? r.overallScore, r.market?.priceUSD100 ?? r.market?.priceUSD1 ?? "", r.market?.stock ?? "", ""].map(q).join(",")));
    m.pendingVerification.forEach(r => rows.push(["待核验候选", r.partNumber, r.manufacturer, `${r.replacementLevel.level} ${r.replacementLevel.label}`, r.technical ?? "", r.evidenceCoverage ?? "", r.sourceConfidence ?? "", r.confidence ?? r.overallScore, r.market?.priceUSD100 ?? r.market?.priceUSD1 ?? "", r.market?.stock ?? "", r.pendingReason || ""].map(q).join(",")));
    m.eliminated.forEach(e => rows.push(["已排除", e.partNumber, e.manufacturer || "", "REJECTED", "", "", "", "", "", "", e.reason || ""].map(q).join(",")));
    rows.push("");
    rows.push([`# ${DISCLAIMER}`].map(q).join(","));
    downloadText(`${m.meta.originalPart}_替代推荐.csv`, "\uFEFF" + rows.join("\n"), "text/csv;charset=utf-8");
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "workbench",
    style: {
      maxWidth: 1400,
      margin: "16px auto",
      padding: "0 20px",
      display: "grid",
      gridTemplateColumns: "400px 1fr",
      gap: 18,
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      border: `1.5px solid ${C.border}`,
      background: "#fff",
      padding: "16px 18px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "3px 10px",
      borderRadius: 5,
      background: C.greenLight,
      color: C.green,
      fontSize: 12,
      fontWeight: 600,
      border: `1px solid ${C.greenMid}`
    }
  }, original.category || "元器件"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 21,
      fontWeight: 700,
      fontFamily: "'DM Mono',monospace",
      color: C.text
    }
  }, original.partNumber), (original._dataPath === "local_db" || original._dataPath === "local_db+ai") && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "2px 7px",
      borderRadius: 4,
      background: C.greenLight,
      color: C.green,
      fontSize: 10,
      fontWeight: 600,
      border: `1px solid ${C.greenMid}`
    }
  }, "\uD83D\uDCE6 ezPLM"), original._dataPath === "local_db+ai" && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "2px 7px",
      borderRadius: 4,
      background: C.amberBg,
      color: C.amber,
      fontSize: 10,
      fontWeight: 600,
      border: "1px solid #f0dca0"
    }
  }, "+AI\u8865\u5145\u53C2\u6570"), original._dataPath === "ai_search" && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "2px 7px",
      borderRadius: 4,
      background: C.amberBg,
      color: C.amber,
      fontSize: 10,
      fontWeight: 600,
      border: "1px solid #f0dca0"
    }
  }, "\uD83C\uDF10 AI\u641C\u7D22")), original.needsVariantConfirm && original.requestedMpn && original.requestedMpn !== original.partNumber && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      padding: "7px 10px",
      borderRadius: 7,
      background: C.amberBg,
      border: "1px solid #f0dca0",
      fontSize: 11,
      color: "#854f0b"
    }
  }, "\u26A0 \u4F60\u67E5\u8BE2\u7684\u662F ", /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: "'DM Mono',monospace"
    }
  }, original.requestedMpn), "\uFF0C ezPLM \u65E0\u8BE5\u7CBE\u786E\u8BA2\u8D27\u53F7\uFF1B\u5F53\u524D\u663E\u793A\u7684\u662F\u540C\u7CFB\u5217\u53D8\u4F53 ", /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: "'DM Mono',monospace"
    }
  }, original.partNumber), " \u7684\u6570\u636E\u3002 \u8BF7\u5728\u4E0B\u65B9\u786E\u8BA4\u5177\u4F53\u5C01\u88C5/\u8BA2\u8D27\u578B\u53F7\u540E\u518D\u505A\u51B3\u7B56\u3002"), original.manufacturer && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: C.textMute,
      marginTop: 5
    }
  }, original.manufacturer), original.description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: C.textSec,
      marginTop: 3
    }
  }, original.description), (original.datasheetUrl || original.footprintFileUrl || original.model3dUrl || original.symbolUrl || original.productUrl) && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: `1px dashed ${C.borderLight}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: C.textSec,
      marginBottom: 8
    }
  }, "\uD83D\uDCE6 \u5E93\u6587\u4EF6\u4E0E\u8D44\u6E90"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, original.datasheetUrl && /*#__PURE__*/React.createElement("a", {
    href: resHref(original.datasheetUrl),
    target: "_blank",
    rel: "noreferrer",
    style: RES_BTN
  }, "\uD83D\uDCC4 Datasheet"), original.footprintFileUrl && /*#__PURE__*/React.createElement("a", {
    href: resHref(original.footprintFileUrl),
    target: "_blank",
    rel: "noreferrer",
    style: RES_BTN,
    title: original.footprintFileName
  }, "\uD83D\uDCD0 KiCad\u5C01\u88C5"), original.model3dUrl && /*#__PURE__*/React.createElement("a", {
    href: resHref(original.model3dUrl),
    target: "_blank",
    rel: "noreferrer",
    style: RES_BTN,
    title: original.model3dFileName
  }, "\uD83E\uDDCA 3D\u6A21\u578B(STEP)"), original.symbolUrl && /*#__PURE__*/React.createElement("a", {
    href: resHref(original.symbolUrl),
    target: "_blank",
    rel: "noreferrer",
    style: RES_BTN
  }, "\uD83D\uDD23 \u539F\u7406\u56FE\u7B26\u53F7"), original.productUrl && /*#__PURE__*/React.createElement("a", {
    href: original.productUrl,
    target: "_blank",
    rel: "noreferrer",
    style: RES_BTN
  }, "\uD83D\uDD17 \u5B98\u7F51\u4EA7\u54C1\u9875")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onShowSelf && onShowSelf(),
    style: {
      marginTop: 8,
      width: "100%",
      padding: "8px",
      borderRadius: 7,
      border: `1px solid ${C.greenMid}`,
      background: C.greenLight,
      color: C.green,
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "\uD83D\uDD0D \u67E5\u770B eCAD \u5E93\uFF08\u7B26\u53F7 / \u5C01\u88C5 / 3D\uFF09\u4E0E\u5B8C\u6574\u8BE6\u60C5")), (original.variants || []).length > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowVariants(v => !v),
    style: {
      marginTop: 10,
      width: "100%",
      padding: "7px",
      borderRadius: 7,
      border: `1px solid ${C.indigoBorder}`,
      background: C.indigoBg,
      color: C.indigo,
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "\uD83D\uDD04 \u8BE5\u578B\u53F7\u6709 ", original.variants.length, " \u4E2A\u5C01\u88C5/\u8BA2\u8D27\u53D8\u4F53 \xB7 ", showVariants ? "收起" : "点击切换"), showVariants && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      maxHeight: 220,
      overflowY: "auto"
    }
  }, original.variants.map((v, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    type: "button",
    onClick: () => onSwitchVariant && onSwitchVariant(v),
    "aria-label": `选择订货型号 ${v.pn}${v.package ? `，封装 ${v.package}` : ""}`,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 10px",
      borderRadius: 7,
      border: `1px solid ${C.borderLight}`,
      marginBottom: 5,
      cursor: "pointer",
      background: "#fff",
      width: "100%",
      textAlign: "left",
      font: "inherit"
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = C.greenLight;
      e.currentTarget.style.borderColor = C.greenMid;
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = "#fff";
      e.currentTarget.style.borderColor = C.borderLight;
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      fontFamily: "'DM Mono',monospace",
      color: C.green
    }
  }, v.pn, v.duplicateConflict && /*#__PURE__*/React.createElement("span", {
    title: `ezPLM 中有 ${v.duplicateCount} 条同型号记录且内容冲突，已合并显示信息最完整的一条`,
    style: {
      marginLeft: 6,
      fontSize: 9,
      padding: "1px 5px",
      borderRadius: 3,
      background: C.amberBg,
      color: C.amber,
      border: "1px solid #f0dca0",
      fontWeight: 600
    }
  }, "\u26A0 \u91CD\u590D\u8BB0\u5F55")), v.manufacturer && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: C.textSec
    }
  }, v.manufacturer), v.note && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: C.textMute,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, v.note)), v.package && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: "2px 6px",
      borderRadius: 4,
      background: C.indigoBg,
      color: C.indigo,
      fontFamily: "'DM Mono',monospace",
      whiteSpace: "nowrap"
    }
  }, v.package))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      border: `1.5px solid ${C.indigoBorder}`,
      background: "#fff",
      padding: "14px 16px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "\uD83C\uDFED \u4F18\u9009\u5382\u5546"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: C.textMute,
      marginBottom: 10
    }
  }, "\u6DFB\u52A0\u4F18\u9009\u5382\u5546\u540E\uFF0C\u540C\u5206\u5019\u9009\u5C06\u4F18\u5148\u63A8\u8350"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: mfrInput,
    onChange: e => setMfrInput(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter") addMfr();
    },
    placeholder: "\u8F93\u5165\u5382\u5546\u540D\u79F0\u641C\u7D22\u2026",
    style: {
      flex: 1,
      padding: "9px 12px",
      borderRadius: 7,
      border: `1px solid ${C.border}`,
      fontSize: 13
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: addMfr,
    disabled: !mfrInput.trim(),
    "aria-disabled": !mfrInput.trim(),
    style: {
      padding: "9px 16px",
      borderRadius: 7,
      border: "none",
      background: C.indigo,
      color: "#fff",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      opacity: mfrInput.trim() ? 1 : 0.5
    }
  }, "\u6DFB\u52A0"), mfrSuggest.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 70,
      marginTop: 4,
      background: "#fff",
      border: `1px solid ${C.border}`,
      borderRadius: 7,
      boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
      zIndex: 20
    }
  }, mfrSuggest.map(m => /*#__PURE__*/React.createElement("div", {
    key: m,
    onClick: () => {
      setMfrs([...mfrs, m]);
      setMfrInput("");
    },
    style: {
      padding: "8px 12px",
      fontSize: 12,
      cursor: "pointer",
      borderBottom: `1px solid ${C.borderLight}`
    }
  }, m)))), mfrs.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginTop: 10
    }
  }, mfrs.map(m => /*#__PURE__*/React.createElement("span", {
    key: m,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "4px 10px",
      borderRadius: 14,
      background: C.indigoBg,
      color: C.indigo,
      fontSize: 12,
      border: `1px solid ${C.indigoBorder}`
    }
  }, "\u2B50 ", m, /*#__PURE__*/React.createElement("button", {
    "aria-label": `移除优选厂商 ${m}`,
    onClick: () => setMfrs(mfrs.filter(x => x !== m)),
    style: {
      cursor: "pointer",
      fontWeight: 700,
      border: "none",
      background: "none",
      color: "inherit",
      fontSize: 13,
      lineHeight: 1,
      padding: 0
    }
  }, "\xD7"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      border: `1.5px solid ${C.border}`,
      background: "#fff",
      padding: "14px 16px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700
    }
  }, "\uD83D\uDCCA \u53C2\u6570\u4F18\u5148\u7EA7\u4E0E\u8303\u56F4"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: C.textMute
    }
  }, "\u62D6\u62FD\u6392\u5E8F \xB7 \u70B9\u51FB\u8BBE\u7EA6\u675F")), params.map((p, i) => /*#__PURE__*/React.createElement(ParamRow, {
    key: p.id,
    p: p,
    index: i,
    con: constraints[p.id],
    onSetCon: setCon,
    onDragStart: onDragStart,
    onDragOver: onDragOver,
    onDrop: onDrop,
    dragging: dragging
  })), reorderNote && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 11,
      color: C.indigo,
      background: C.indigoBg,
      border: `1px solid ${C.indigoBorder}`,
      borderRadius: 6,
      padding: "6px 8px"
    }
  }, "\uD83D\uDCA1 ", reorderNote)), mode === "lowCost" && /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      border: `1.5px solid ${C.amber}55`,
      background: C.amberBg,
      padding: "14px 16px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      marginBottom: 4,
      color: "#854f0b"
    }
  }, "\uD83D\uDED2 \u91C7\u8D2D\u6761\u4EF6"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#854f0b",
      marginBottom: 10
    }
  }, "\u4F4E\u6210\u672C\u6392\u5E8F\u53EA\u4F7F\u7528\u771F\u5B9E\u5206\u9500\u5546\u62A5\u4EF7\uFF1B\u65E0\u771F\u5B9E\u62A5\u4EF7\u7684\u5019\u9009\u4F1A\u88AB\u79FB\u5165\u5F85\u6838\u9A8C\uFF0C\u4E0D\u53C2\u4E0E\u6210\u672C\u6392\u540D"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: C.textSec
    }
  }, "\u91C7\u8D2D\u5730\u533A", /*#__PURE__*/React.createElement("select", {
    value: procurement.region,
    onChange: e => setProcurement({
      ...procurement,
      region: e.target.value
    }),
    style: {
      width: "100%",
      padding: "5px 8px",
      borderRadius: 6,
      border: `1px solid ${C.border}`,
      fontSize: 12,
      marginTop: 3
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "CN"
  }, "\u4E2D\u56FD\u5927\u9646"), /*#__PURE__*/React.createElement("option", {
    value: "HK"
  }, "\u4E2D\u56FD\u9999\u6E2F"), /*#__PURE__*/React.createElement("option", {
    value: "US"
  }, "\u7F8E\u56FD"), /*#__PURE__*/React.createElement("option", {
    value: "EU"
  }, "\u6B27\u6D32"))), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: C.textSec
    }
  }, "\u91C7\u8D2D\u6570\u91CF", /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    value: procurement.quantity,
    onChange: e => setProcurement({
      ...procurement,
      quantity: Math.max(1, parseInt(e.target.value) || 1)
    }),
    style: {
      width: "100%",
      padding: "5px 8px",
      borderRadius: 6,
      border: `1px solid ${C.border}`,
      fontSize: 12,
      marginTop: 3
    }
  })), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: C.textSec
    }
  }, "\u5305\u88C5\u65B9\u5F0F", /*#__PURE__*/React.createElement("select", {
    value: procurement.packaging,
    onChange: e => setProcurement({
      ...procurement,
      packaging: e.target.value
    }),
    style: {
      width: "100%",
      padding: "5px 8px",
      borderRadius: 6,
      border: `1px solid ${C.border}`,
      fontSize: 12,
      marginTop: 3
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "any"
  }, "\u4E0D\u9650"), /*#__PURE__*/React.createElement("option", {
    value: "tape"
  }, "\u5377\u5E26 Tape&Reel"), /*#__PURE__*/React.createElement("option", {
    value: "tube"
  }, "\u7BA1\u88C5 Tube"), /*#__PURE__*/React.createElement("option", {
    value: "tray"
  }, "\u6258\u76D8 Tray"), /*#__PURE__*/React.createElement("option", {
    value: "cut"
  }, "\u6563\u88C5 Cut Tape"))), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: C.textSec
    }
  }, "\u5E01\u79CD", /*#__PURE__*/React.createElement("select", {
    value: procurement.currency,
    onChange: e => setProcurement({
      ...procurement,
      currency: e.target.value
    }),
    style: {
      width: "100%",
      padding: "5px 8px",
      borderRadius: 6,
      border: `1px solid ${C.border}`,
      fontSize: 12,
      marginTop: 3
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "USD"
  }, "USD"), /*#__PURE__*/React.createElement("option", {
    value: "CNY"
  }, "CNY"), /*#__PURE__*/React.createElement("option", {
    value: "EUR"
  }, "EUR")))), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      color: C.textSec,
      marginTop: 8,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: procurement.inStockOnly,
    onChange: e => setProcurement({
      ...procurement,
      inStockOnly: e.target.checked
    })
  }), "\u4EC5\u663E\u793A\u6709\u73B0\u8D27\u7684\u5019\u9009\uFF08\u65E0\u5E93\u5B58\u6570\u636E\u7684\u79FB\u5165\u5F85\u6838\u9A8C\uFF09")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 12,
      border: `1.5px solid ${C.border}`,
      background: "#fff",
      padding: "14px 16px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      marginBottom: 10
    }
  }, "\uD83D\uDD00 \u66FF\u4EE3\u6A21\u5F0F"), /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    "aria-label": "\u66FF\u4EE3\u6A21\u5F0F",
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, SUB_MODES.map(m => {
    const disabled = m.id === "pin2pin" && original._pkgConfirmed === false;
    return /*#__PURE__*/React.createElement("button", {
      key: m.id,
      type: "button",
      role: "radio",
      "aria-checked": mode === m.id,
      disabled: disabled,
      onClick: () => !disabled && setMode(m.id),
      title: disabled ? "封装未限定，无法评估引脚兼容性。请返回选择具体封装型号后使用" : "",
      style: {
        padding: "9px 12px",
        borderRadius: 8,
        borderWidth: 1.5,
        borderStyle: "solid",
        borderColor: disabled ? "#e0e0e0" : mode === m.id ? C.green : C.border,
        background: disabled ? "#f5f5f5" : mode === m.id ? C.greenLight : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: disabled ? 0.55 : 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: disabled ? C.textMute : C.text
      }
    }, m.label, disabled && " 🔒"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: C.textMute
      }
    }, disabled ? "封装未限定，不可用" : m.desc));
  })), original._pkgConfirmed === false && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 11,
      color: C.textMute
    }
  }, "\uD83D\uDCA1 \u672A\u9650\u5B9A\u5C01\u88C5\u65F6\u65E0\u6CD5\u505A Pin-to-Pin \u5224\u5B9A\u3002\u5982\u9700\u8BE5\u6A21\u5F0F\uFF0C\u8BF7\u91CD\u65B0\u641C\u7D22\u5E76\u9009\u62E9\u5177\u4F53\u5C01\u88C5\u578B\u53F7\u3002")), /*#__PURE__*/React.createElement("button", {
    onClick: runRecommend,
    disabled: phase === "loading",
    style: {
      width: "100%",
      padding: "14px",
      borderRadius: 10,
      border: "none",
      background: phase === "loading" ? C.greenAccent : C.green,
      color: "#fff",
      fontSize: 15,
      fontWeight: 700,
      cursor: phase === "loading" ? "wait" : "pointer",
      letterSpacing: 1
    }
  }, phase === "loading" ? "⏳ 推荐中…" : phase === "done" ? "🔄 重新推荐" : "🚀 AI 智能推荐"), /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      width: "100%",
      marginTop: 8,
      padding: "9px",
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      background: "#fff",
      color: C.textSec,
      fontSize: 13,
      cursor: "pointer"
    }
  }, "\u2190 \u91CD\u65B0\u641C\u7D22")), /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: 400
    }
  }, note && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 14px",
      borderRadius: 7,
      background: C.amberBg,
      border: "1px solid #f0dca0",
      color: "#854f0b",
      fontSize: 12,
      marginBottom: 12
    }
  }, "\u2139\uFE0F ", note), phase === "idle" && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      paddingTop: 150,
      color: C.textMute
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: C.textSec,
      marginBottom: 6
    }
  }, "\u8C03\u6574\u53C2\u6570\u540E\uFF0C\u70B9\u51FB\u300CAI \u667A\u80FD\u63A8\u8350\u300D"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13
    }
  }, "AI\u63A8\u8350\u5019\u9009 \u2192 \u672C\u5730\u5E93\u6821\u9A8C \u2192 \u7B97\u6CD5\u8BC4\u5206 \u2192 \u8F93\u51FA Top 5")), phase === "loading" && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      paddingTop: 150,
      color: C.textMute
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      border: `3px solid ${C.borderLight}`,
      borderTopColor: C.green,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
      margin: "0 auto 14px"
    }
  }), "\u6B63\u5728\u63A8\u8350\uFF08AI\u5019\u9009 \u2192 \u672C\u5730\u5E93\u6821\u9A8C \u2192 \u8BC4\u5206\u6DD8\u6C70\uFF09\uFF0C\u7EA6\u9700 10\u201330 \u79D2\u2026"), phase === "done" && result && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "fadeUp 0.4s ease both"
    }
  }, result._noCandidates && (result.eliminated || []).length > 0 && (() => {
    // 按原因归类，一眼看出"为什么全被排除"
    const groups = {};
    for (const e of result.eliminated) {
      const r = String(e.reason || "未说明");
      const st = e.stage || "";
      const key = st === "lookup_failed" || /未收录|查询失败|未校验/.test(r) ? "未查到该型号的数据（非技术原因）" : st === "category" || /功能类别不符/.test(r) ? "功能类别不符" : st === "hard_constraint" || /硬约束|无法验证/.test(r) ? "硬约束不满足或无法验证" : st === "mode_gate" ? /封装/.test(r) ? "封装不满足当前模式要求" : /非国产/.test(r) ? "厂商非国产" : /价格|报价|现货/.test(r) ? "缺少真实报价或无现货" : /证据覆盖率/.test(r) ? "证据覆盖率不足" : "不满足当前替代模式门槛" : st === "ai_filter" ? "AI 初筛排除" : /可信度|评分|阈值/.test(r) ? "综合可信度低于阈值" : "其它";
      (groups[key] || (groups[key] = [])).push(e);
    }
    const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 16px",
        borderRadius: 8,
        background: C.bgSoft,
        border: `1px solid ${C.border}`,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: C.text,
        marginBottom: 8
      }
    }, "\u4E3A\u4EC0\u4E48\u6CA1\u6709\u63A8\u8350\u7ED3\u679C\uFF1F", result.eliminated.length, " \u4E2A\u5019\u9009\u7684\u6392\u9664\u539F\u56E0\u5206\u5E03\uFF1A"), entries.map(([k, v]) => /*#__PURE__*/React.createElement("div", {
      key: k,
      style: {
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "4px 0",
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 26,
        fontWeight: 700,
        color: C.amber,
        fontFamily: "'DM Mono',monospace"
      }
    }, v.length), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        color: C.textSec
      }
    }, k), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: C.textMute,
        fontFamily: "'DM Mono',monospace",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: 280
      }
    }, v.slice(0, 3).map(x => x.partNumber).join("、"), v.length > 3 ? ` 等 ${v.length} 个` : ""))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 9,
        paddingTop: 9,
        borderTop: `1px dashed ${C.borderLight}`,
        fontSize: 11,
        color: C.textMute
      }
    }, "\uD83D\uDCA1 ", entries[0] && /未查到/.test(entries[0][0]) ? "多数候选未查到数据：这些型号可能不在 ezPLM 白名单内，也未被 DigiKey/Mouser 精确匹配。可先确认该品类在库覆盖情况。" : "可尝试：放宽硬约束 / 切换到「功能兼容」模式 / 取消优选厂商限制 / 降低应用场景要求"));
  })(), (result.recommendations || []).some(r => r._lowConfidence) && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 14px",
      borderRadius: 7,
      background: C.amberBg,
      border: "1px solid #f0dca0",
      color: "#854f0b",
      fontSize: 12,
      marginBottom: 12
    }
  }, "\u26A0 \u4EE5\u4E0B\u5019\u9009\u7684\u8BC1\u636E\u53EF\u4FE1\u5EA6\u4F4E\u4E8E\u5E38\u89C4\u9608\u503C\uFF08\u591A\u4E3AAI\u6765\u6E90\u4E14\u8D44\u6599\u4E0D\u5168\uFF09\uFF0C\u4EC5\u4F9B\u53C2\u8003\u65B9\u5411\uFF0C\u52A1\u5FC5\u4EBA\u5DE5\u6838\u5BF9 datasheet \u540E\u518D\u51B3\u7B56"), (result.eliminated || []).some(e => /功能类别不符/.test(e.reason || "")) && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 14px",
      borderRadius: 7,
      background: C.greenLight,
      border: `1px solid ${C.greenMid}`,
      color: C.green,
      fontSize: 12,
      marginBottom: 12
    }
  }, "\u2713 \u5DF2\u81EA\u52A8\u62E6\u622A ", (result.eliminated || []).filter(e => /功能类别不符/.test(e.reason || "")).length, " \u4E2A\u529F\u80FD\u7C7B\u522B\u4E0D\u7B26\u7684\u5019\u9009\uFF08\u89C1\u4E0B\u65B9\u6DD8\u6C70\u5217\u8868\uFF09"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
      flexWrap: "wrap",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 16,
      fontWeight: 700
    }
  }, result._noCandidates ? "排除详情" : "推荐结果", " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: C.textMute,
      fontWeight: 400
    }
  }, "\xB7 ", result.recommendations.length, " \u4E2A\u66FF\u4EE3\u65B9\u6848", result.basePrice != null ? ` · 原型号 $${result.basePrice}` : "", " \xB7 \u70B9\u51FB\u578B\u53F7\u67E5\u770B\u91C7\u8D2D\u8BE6\u60C5")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      borderRadius: 7,
      border: `1px solid ${C.border}`,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setView("cards"),
    style: {
      padding: "5px 14px",
      border: "none",
      background: view === "cards" ? C.green : "#fff",
      color: view === "cards" ? "#fff" : C.textSec,
      fontSize: 12,
      cursor: "pointer"
    }
  }, "\u5361\u7247"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "tab",
    "aria-selected": view === "table",
    onClick: () => setView("table"),
    style: {
      padding: "5px 14px",
      border: "none",
      background: view === "table" ? C.green : "#fff",
      color: view === "table" ? "#fff" : C.textSec,
      fontSize: 12,
      cursor: "pointer"
    }
  }, "\u5BF9\u6BD4\u8868")), /*#__PURE__*/React.createElement("button", {
    onClick: exportMD,
    style: {
      padding: "5px 12px",
      borderRadius: 7,
      border: `1px solid ${C.border}`,
      background: "#fff",
      fontSize: 12,
      cursor: "pointer"
    }
  }, "\uD83D\uDCC4 MD"), /*#__PURE__*/React.createElement("button", {
    onClick: exportCSV,
    style: {
      padding: "5px 12px",
      borderRadius: 7,
      border: `1px solid ${C.border}`,
      background: "#fff",
      fontSize: 12,
      cursor: "pointer"
    }
  }, "\uD83D\uDCCA CSV"))), view === "cards" ? /*#__PURE__*/React.createElement(React.Fragment, null, (result.recommendations || []).map((rec, i) => /*#__PURE__*/React.createElement(ResultCard, {
    key: rec.partNumber,
    rec: rec,
    index: i,
    market: market,
    onShowDetail: (pn, r) => {
      setDetailPN(pn);
      setDetailRec(r);
    }
  })), (result.pendingVerification || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "9px 14px",
      borderRadius: 8,
      background: C.amberBg,
      border: "1px solid #f0dca0",
      color: "#854f0b",
      fontSize: 12,
      marginBottom: 10
    }
  }, "\uD83D\uDD0D \u5F85\u6838\u9A8C\u5019\u9009\uFF08", result.pendingVerification.length, " \u4E2A\uFF09\xB7 ", /*#__PURE__*/React.createElement("b", null, "\u4E0D\u8FDB\u5165\u6B63\u5F0F\u63A8\u8350\u6392\u540D"), "\u3002 \u539F\u56E0\u4E3A\u4EE5\u4E0B\u4E4B\u4E00\uFF1A\u786C\u7EA6\u675F\u5B57\u6BB5\u7F3A\u5931\u65E0\u6CD5\u9A8C\u8BC1\uFF08\u6309 fail-closed \u5904\u7406\uFF09\uFF0C \u6216\u578B\u53F7\u672A\u83B7 ezPLM / \u5206\u9500\u5546\u7CBE\u786E\u786E\u8BA4\u3002\u8BF7\u4EBA\u5DE5\u6838\u5BF9 datasheet \u540E\u518D\u51B3\u7B56"), result.pendingVerification.map((rec, i) => /*#__PURE__*/React.createElement("div", {
    key: rec.partNumber,
    style: {
      opacity: .82
    }
  }, /*#__PURE__*/React.createElement(ResultCard, {
    rec: rec,
    index: i,
    market: market,
    pending: true,
    onShowDetail: (pn, r) => {
      setDetailPN(pn);
      setDetailRec(r);
    }
  }))))) : /*#__PURE__*/React.createElement(CompareTable, {
    original: original,
    recs: result.recommendations || []
  }), (result.eliminated || []).length > 0 && /*#__PURE__*/React.createElement("details", {
    open: !!result._noCandidates,
    style: {
      marginTop: 12,
      borderRadius: 10,
      border: `1px solid ${C.borderLight}`,
      background: "#fff"
    }
  }, /*#__PURE__*/React.createElement("summary", {
    style: {
      padding: "11px 16px",
      cursor: "pointer",
      fontSize: 13,
      color: C.textSec,
      fontWeight: 500
    }
  }, "\uD83D\uDEAB \u88AB\u6DD8\u6C70\u7684\u5019\u9009\uFF08", result.eliminated.length, "\u4E2A\uFF09\xB7 \u6309\u7ED3\u8BBA\u53EF\u4FE1\u5EA6\u964D\u5E8F\uFF0C\u524D 5 \u4E2A\u53EF\u5C55\u5F00\u9010\u53C2\u6570\u5BF9\u6BD4"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 16px 12px"
    }
  }, result.eliminated.map((e, i) => /*#__PURE__*/React.createElement(EliminatedRow, {
    key: i,
    item: e,
    index: i
  }))))), detailPN && /*#__PURE__*/React.createElement(PartDetailModal, {
    pn: detailPN,
    rec: detailRec,
    onClose: () => {
      setDetailPN(null);
      setDetailRec(null);
    }
  })));
}

// ═══ 主应用 ═══
function App() {
  const [page, setPage] = useState("home");
  // 版本自检：这是第二次出现"后端已部署新版、页面还跑旧 bundle"（SPA 标签页
  // 一直开着不会重新拉 index.html）。后端行为变了、前端行为没变，极难自行察觉。
  // 挂载时对比 /api/health 的版本，落后即提示刷新。
  const [staleVer, setStaleVer] = useState(null);
  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(d => {
      const server = String(d?.service || "").match(/v([\d.]+)/)?.[1];
      if (server && server !== APP_VERSION) setStaleVer(server);
    }).catch(() => {});
  }, []);
  const [original, setOriginal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demoNote, setDemoNote] = useState("");
  const [homeErr, setHomeErr] = useState("");
  const [variantBase, setVariantBase] = useState(null);
  const ANALYZE_ERR = {
    PART_NOT_FOUND: "未找到该型号，请检查拼写或输入完整订货型号",
    PART_UNVERIFIED: "该型号未能在 ezPLM 与分销商数据库中确认存在",
    NOT_FOUND: "未找到该型号，请检查拼写或输入完整订货型号",
    UNPROCESSABLE: "该型号未能在权威数据源中确认存在",
    BAD_REQUEST: "请输入有效的器件型号",
    INTERNAL: "服务内部错误，请稍后重试"
  };
  const analyze = async pn => {
    if (busy) return;
    setBusy(true);
    setDemoNote("");
    setHomeErr("");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch("/api/v2/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: ctl.signal,
        body: JSON.stringify({
          partNumber: pn
        })
      });
      clearTimeout(timer);
      const ct = r.headers.get("content-type") || "";
      const d = ct.includes("json") ? await r.json().catch(() => null) : null;
      if (r.ok && d && d.success && d.original?.parameters?.length) {
        if ((d.original.variants || []).length >= 2) {
          setVariantBase(d.original);
          setPage("variants");
        } else {
          setOriginal({
            ...d.original,
            _pkgConfirmed: true
          });
          setPage("workbench");
        }
        return;
      }
      if (pn.toUpperCase() === "STM32F103C8T6") {
        setOriginal({
          ...MOCK_ORIGINAL,
          _pkgConfirmed: true
        });
        setDemoNote("演示模式");
        setPage("workbench");
        return;
      }
      // error 是对象，必须逐字段读取；直接拼进模板串会显示 [object Object]
      const e = d && d.error;
      if (typeof e === "string" && e) {
        setHomeErr(`查询失败：${e}`);
        return;
      }
      if (e && typeof e === "object") {
        const code = e.details?.code || e.code;
        const base = ANALYZE_ERR[code] || e.message || "查询失败";
        const hint = e.details?.hint ? ` ${e.details.hint}` : "";
        const sug = e.details?.aiSuggestion ? `（是否想查 ${e.details.aiSuggestion}？）` : "";
        setHomeErr(`${base}${sug}${hint} · ${code || ""} · ${e.requestId || ""}`);
        return;
      }
      setHomeErr(`查询失败（HTTP ${r.status}）${d ? "" : "，响应非 JSON"}`);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        setHomeErr("查询超时（45 秒），请重试");
        return;
      }
      if (pn.toUpperCase() === "STM32F103C8T6") {
        setOriginal(MOCK_ORIGINAL);
        setPage("workbench");
      } else setHomeErr(`网络错误：${err.message || "请重试"}`);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, staleVer && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff8e6",
      borderBottom: "1px solid #f0dca0",
      padding: "8px 24px",
      fontSize: 12,
      color: "#854f0b",
      display: "flex",
      alignItems: "center",
      gap: 10,
      justifyContent: "center"
    }
  }, "\u26A0 \u9875\u9762\u7248\u672C v", APP_VERSION, " \u843D\u540E\u4E8E\u670D\u52A1\u7AEF v", staleVer, "\uFF0C\u90E8\u5206\u4FEE\u590D\u672A\u751F\u6548", /*#__PURE__*/React.createElement("button", {
    onClick: () => location.reload(true),
    style: {
      padding: "3px 12px",
      borderRadius: 6,
      border: "1px solid #f0dca0",
      background: "#fff",
      color: "#854f0b",
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "\u5237\u65B0\u9875\u9762")), /*#__PURE__*/React.createElement("header", {
    style: {
      background: "#fff",
      borderBottom: `1px solid ${C.border}`,
      padding: "12px 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1400,
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 9,
      background: C.green,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2L3 7v10l9 5 9-5V7l-9-5z",
    stroke: "#fff",
    strokeWidth: "1.8",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7v10M7 9.5l5 3 5-3",
    stroke: "#fff",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    "data-app-version": APP_VERSION,
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: C.text
    }
  }, "AltPart Pro"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: C.textMute
    }
  }, "\u5143\u5668\u4EF6\u66FF\u4EE3\u51B3\u7B56\u667A\u80FD\u4F53 \xB7 ezPLM\u96C6\u6210")), page === "workbench" && /*#__PURE__*/React.createElement("button", {
    onClick: () => setPage("home"),
    style: {
      padding: "8px 16px",
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      background: "#fff",
      color: C.textSec,
      fontSize: 13,
      cursor: "pointer"
    }
  }, "\u2190 \u91CD\u65B0\u641C\u7D22"))), /*#__PURE__*/React.createElement("main", {
    style: {
      minHeight: "calc(100vh - 130px)"
    }
  }, page === "home" && /*#__PURE__*/React.createElement(HomePage, {
    onSubmit: analyze,
    busy: busy,
    err: homeErr
  }), page === "variants" && variantBase && /*#__PURE__*/React.createElement(VariantPicker, {
    base: variantBase,
    onPick: v => {
      const params = (variantBase.parameters || []).map(p => (p.name.includes("封装") || String(p.nameEn || "").toLowerCase().includes("package")) && v.package ? {
        ...p,
        value: v.package
      } : p);
      setOriginal({
        ...variantBase,
        partNumber: v.pn,
        parameters: params,
        variants: [],
        _pkgConfirmed: true
      });
      setPage("workbench");
    },
    onSkip: () => {
      setOriginal({
        ...variantBase,
        variants: [],
        _pkgConfirmed: false
      });
      setPage("workbench");
    },
    onBack: () => setPage("home")
  }), page === "workbench" && original && /*#__PURE__*/React.createElement(Workbench, {
    key: original.partNumber,
    original: original,
    demoNote: demoNote,
    onBack: () => setPage("home"),
    onSwitchVariant: v => analyze(v.pn)
  })), /*#__PURE__*/React.createElement("footer", {
    "data-app-version": APP_VERSION,
    style: {
      textAlign: "center",
      padding: "14px",
      borderTop: `1px solid ${C.borderLight}`,
      fontSize: 12,
      color: C.textMute,
      background: "#fff"
    }
  }, "AltPart Pro \xB7 ezPLM\u5143\u5668\u4EF6\u5E93 \xB7 \u5B9E\u65F6\u884C\u60C5 \xB7 \u573A\u666F\u5316\u66FF\u4EE3 \xB7 \u786E\u5B9A\u6027\u8BC4\u5206"));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));