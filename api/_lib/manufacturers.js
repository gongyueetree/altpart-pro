// manufacturers.js — 厂商归属主数据
//
// 线上问题：国产替代模式把 XLSEMI(芯龙)、CJ/CET(长电)、UTC(友顺)、HT(合泰)
// 等中国厂商全判为"非国产"，导致真正的国产料被排除。
//
// 说明：本表为**关键词映射**，不是权威主数据。确定性的厂商国别应由 ezPLM
// 提供 manufacturer 主数据（见 docs/EZPLM_API_REQUIREMENTS.md）。
// 在此之前，本表用于避免明显误判，并对未收录厂商返回 unknown 而非武断判否。

/** 中国大陆厂商 */
const CN_MAINLAND = [
  // MCU / 数字
  "兆易创新", "gigadevice", "gd32", "沁恒", "wch", "极海", "geehy", "国民技术", "nations",
  "航顺", "hk32", "hkmicro", "灵动微", "mindmotion", "雅特力", "artery", "华大半导体", "hdsc",
  "中颖", "sinowealth", "赛元", "sinomcu", "宏晶", "stc micro", "复旦微", "fudan",
  "紫光", "unisoc", "全志", "allwinner", "瑞芯微", "rockchip", "乐鑫", "espressif",
  "芯海", "chipsea", "东软载波", "essemi", "小华", "huada", "凌鸥", "linko",
  // 模拟 / 电源
  "圣邦微", "sgmicro", "sg micro", "思瑞浦", "3peak", "芯朋微", "chipown", "士兰微", "silan",
  "杰华特", "joulwatt", "南芯", "southchip", "矽力杰", "silergy", "上海贝岭", "belling",
  "纳芯微", "novosense", "necoc", "钰泰", "eutech", "芯龙", "xlsemi", "xl semi",
  "润石", "runic", "艾为", "awinic", "希荻微", "halo micro", "必易", "kiwi",
  "英集芯", "injoinic", "灿瑞", "crmicro", "中微爱芯", "aichip", "微源", "lowpower",
  "晶丰明源", "bright power", "bpsemi", "明微", "mingwei", "泰德", "titan micro",
  "力生美", "lsm", "美芯晟", "maxic", "长运通", "cyt", "思特威", "smartsens",
  "格科微", "galaxycore", "韦尔", "willsemi", "豪威", "omnivision",
  // 分立 / 功率 / 封测
  "长电", "changjiang electronics", "jcet", "cet", "华微", "huawei micro",
  "扬杰", "yangjie", "捷捷微", "jiejie", "银河微", "yinhe", "无锡新洁能", "ncepower",
  "华润微", "crmicro", "china resources", "比亚迪半导体", "byd semi",
  "三安", "sanan", "斯达", "starpower", "宏微", "macmic", "达尔", "diodes china",
  // 存储 / 接口
  "长江存储", "ymtc", "长鑫", "cxmt", "普冉", "puya", "聚辰", "giantec",
  "复旦微电子", "武汉新芯", "xmc", "东芯", "dosilicon",
];

/** 中国台湾厂商（与大陆区分，采购与合规口径常不同） */
const CN_TAIWAN = [
  "友顺", "utc", "unisonic", "合泰", "holtek", "松翰", "sonix", "义隆", "elan",
  "台积电", "tsmc", "联电", "umc", "旺宏", "macronix", "华邦", "winbond",
  "钰创", "etron", "南亚科", "nanya", "立锜", "richtek", "茂达", "anpec",
  "致新", "global mixed-mode", "gmt", "通嘉", "leadtrend", "崇贸", "system general",
  "聚积", "macroblock", "点晶", "princeton", "盛群", "hycon", "九齐", "nyquest",
  "凌通", "generalplus", "matsu", "硅创", "sitronix", "敦南", "lite-on semi",
];

/** 明确的境外厂商（用于把 unknown 与"确认非国产"分开） */
const OVERSEAS = [
  "texas instruments", "analog devices", "linear technology", "maxim",
  "stmicroelectronics", "microchip", "atmel", "nxp", "freescale",
  "infineon", "international rectifier", "cypress", "renesas", "intersil", "idt",
  "on semiconductor", "onsemi", "fairchild", "vishay", "diodes incorporated",
  "rohm", "toshiba", "nexperia", "nisshinbo", "new japan radio", "njr",
  "skyworks", "qorvo", "hittite", "hmc", "broadcom", "marvell", "qualcomm",
  "nordic semiconductor", "silicon labs", "dialog", "melexis", "ams", "sensirion",
  "murata", "tdk", "panasonic", "kemet", "yageo", "samsung", "sk hynix", "micron",
];

const norm = s => String(s || "").toLowerCase().replace(/[.,()\-_]/g, " ").replace(/\s+/g, " ").trim();
const hit = (text, list) => list.some(k => text.includes(k.toLowerCase()));

/**
 * 判定厂商归属
 * @returns { origin: 'CN'|'TW'|'OVERSEAS'|'UNKNOWN', domestic: boolean|null, matched?: string }
 *   domestic=null 表示无法确定（不得据此武断排除）
 */
function manufacturerOrigin(name, extra = "") {
  const t = norm(`${name} ${extra}`);
  if (!t) return { origin: "UNKNOWN", domestic: null };
  if (hit(t, CN_MAINLAND)) return { origin: "CN", domestic: true };
  if (hit(t, CN_TAIWAN)) return { origin: "TW", domestic: true };      // 默认计入"国产"，可由选项调整
  if (hit(t, OVERSEAS)) return { origin: "OVERSEAS", domestic: false };
  return { origin: "UNKNOWN", domestic: null };
}

/**
 * 国产替代模式的判定
 * @param opts.includeTaiwan 是否把台湾厂商计入国产（默认 true）
 * @param opts.strict 未知厂商是否按非国产处理（默认 false —— 宁可标待核验，不武断排除）
 */
function isDomesticManufacturer(name, extra = "", opts = {}) {
  const { includeTaiwan = true, strict = false } = opts;
  const r = manufacturerOrigin(name, extra);
  if (r.origin === "CN") return { pass: true, origin: r.origin };
  if (r.origin === "TW") return includeTaiwan
    ? { pass: true, origin: r.origin }
    : { pass: false, origin: r.origin, reason: "台湾厂商，当前设置未计入国产" };
  if (r.origin === "OVERSEAS") return { pass: false, origin: r.origin, reason: "境外厂商" };
  return strict
    ? { pass: false, origin: "UNKNOWN", reason: "厂商归属未知，严格模式下不计入国产" }
    : { pass: null, origin: "UNKNOWN", reason: "厂商归属未收录，需人工确认是否国产" };
}

module.exports = { manufacturerOrigin, isDomesticManufacturer, CN_MAINLAND, CN_TAIWAN, OVERSEAS };
