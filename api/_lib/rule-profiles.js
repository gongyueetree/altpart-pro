// rule-profiles.js — 替代模式的确定性规则
//
// 此前五种模式只改变给 LLM 的提示词与部分权重，没有任何程序化门槛：
// 选「Pin-to-Pin」也可能返回封装不同的候选，选「国产替代」也可能返回非国产品牌。
// 本模块把每种模式的**硬性要求**下沉为确定性判定，LLM 只负责生成候选。

const CN_HINTS = [
  // 常见国产半导体厂商（按品牌名匹配；确定性国别判断需 ezPLM 厂商主数据，见 docs）
  "兆易创新", "gigadevice", "沁恒", "wch", "极海", "geehy", "国民技术", "nations",
  "航顺", "hk32", "灵动微", "mindmotion", "雅特力", "artery", "华大半导体", "hdsc",
  "圣邦微", "sgmicro", "思瑞浦", "3peak", "芯朋微", "chipown", "士兰微", "silan",
  "杰华特", "joulwatt", "南芯", "southchip", "矽力杰", "silergy", "上海贝岭", "belling",
  "复旦微", "fudan", "紫光", "unisoc", "全志", "allwinner", "瑞芯微", "rockchip",
  "中颖", "sinowealth", "赛元", "sinomcu", "钰泰", "eutech", "necoc", "纳芯微", "novosense",
  "芯海", "chipsea", "比亚迪半导体", "byd", "долг", "长电", "华润微", "crmicro",
];

/**
 * 五种模式的规则档案
 *  requirePackageExact  封装必须完全一致（不接受兼容族）
 *  requirePinVerified   必须有引脚映射证据才可进入结果
 *  requirePackageCompat 封装必须一致或同兼容族
 *  requireDomestic      必须为国产厂商
 *  hardParams           这些参数若不满足即淘汰（正则匹配参数名）
 *  minEvidenceCoverage  证据覆盖率下限
 *  weightBoost          参数权重加成（正则 → 倍数）
 */
const PROFILES = {
  pin2pin: {
    label: "Pin-to-Pin",
    requirePackageExact: true,
    requirePinVerified: false,   // 有证据才判 DIRECT；无证据仍可列为待核，但封装必须一致
    minEvidenceCoverage: 60,
    hardParams: [/封装|package/i],
    weightBoost: [[/封装|package|引脚|pin/i, 2.0], [/工作电压|supply\s*voltage/i, 1.3]],
    note: "封装必须完全一致；引脚映射未验证时仅标记为待复核，不会判定为可直接替换",
  },
  pkgCompat: {
    label: "封装兼容",
    requirePackageCompat: true,
    minEvidenceCoverage: 50,
    hardParams: [/封装|package/i],
    weightBoost: [[/封装|package/i, 1.8], [/工作电压|supply/i, 1.2]],
    note: "封装需一致或属同一兼容族（如 SOIC-8 / SOP-8）",
  },
  funcCompat: {
    label: "功能兼容",
    minEvidenceCoverage: 40,
    weightBoost: [[/内核|core|通道|channel|带宽|bandwidth|分辨率|resolution/i, 1.4]],
    note: "允许改板，功能参数优先",
  },
  domestic: {
    label: "国产替代",
    requireDomestic: true,
    minEvidenceCoverage: 40,
    weightBoost: [[/工作温度|temperature|封装|package/i, 1.3]],
    note: "仅保留国产厂商；厂商国别按品牌名判断，需 ezPLM 厂商主数据才能做到确定性",
  },
  lowCost: {
    label: "低成本优先",
    minEvidenceCoverage: 40,
    requirePriceKnown: true,
    weightBoost: [[/价格|price/i, 2.2]],
    note: "必须有价格数据方可参与比较；无报价的候选降级为待核验",
  },
};

function isDomestic(manufacturer, extra = "") {
  const t = `${manufacturer || ""} ${extra}`.toLowerCase();
  return CN_HINTS.some(h => t.includes(h.toLowerCase()));
}

/**
 * 按模式调整参数权重
 * 注意：加成不能只乘原始名次权重 —— 排在最后的参数（权重 1）即使 ×2.2 仍低于中位参数，
 * 会出现"低成本模式下价格权重仍不如带宽"的反直觉结果。
 * 因此命中加成的参数，其权重不低于 (最大权重 × 加成系数 / 最大系数)，保证真正被提到前面。
 */
function weightsFor(mode, params, priorityOrder) {
  const p = PROFILES[mode] || PROFILES.funcCompat;
  const n = priorityOrder.length;
  const base = {};
  priorityOrder.forEach((id, i) => { base[id] = n - i; });
  if (!p.weightBoost || !n) return base;

  const maxMul = Math.max(...p.weightBoost.map(([, m]) => m), 1);
  for (const id of priorityOrder) {
    const param = params.find(x => x.id === id);
    if (!param) continue;
    const text = `${param.name || ""} ${param.nameEn || ""}`;
    for (const [re, mul] of p.weightBoost) {
      if (!re.test(text)) continue;
      // 名次权重按系数放大，同时保证达到"按系数比例分配的高位权重"
      const byRank = base[id] * mul;
      const byBoost = n * (mul / maxMul);
      base[id] = Math.max(1, Math.round(Math.max(byRank, byBoost)));
      break;
    }
  }
  return base;
}

/**
 * 模式门槛判定 —— 在评分之后、进入结果之前执行
 * @returns { pass:boolean, reason?:string, downgrade?:string }
 */
function applyProfile(mode, ctx) {
  const p = PROFILES[mode];
  if (!p) return { pass: true };
  const { original, candidate, scoreResult } = ctx;

  const findParam = re => {
    const op = (original.parameters || []).find(x => re.test(`${x.name} ${x.nameEn || ""}`));
    if (!op) return null;
    const cv = candidate.parameters?.[op.id];
    const ps = (scoreResult.paramScores || []).find(x => x.paramId === op.id);
    return { orig: op, cand: cv, score: ps };
  };

  // 封装要求
  if (p.requirePackageExact || p.requirePackageCompat) {
    const pk = findParam(/封装|package/i);
    if (!pk) return { pass: true, downgrade: "NEEDS_VERIFICATION", reason: "原型号未标注封装，无法执行封装门槛" };
    if (!pk.score?.known) return { pass: false, reason: `${p.label} 模式要求已知封装，候选未提供封装信息` };
    const s = pk.score.score ?? 0;
    if (p.requirePackageExact && s < 100)
      return { pass: false, reason: `${p.label} 模式要求封装完全一致（原 ${pk.orig.value} vs 候选 ${pk.cand?.value}）` };
    if (p.requirePackageCompat && s < 80)
      return { pass: false, reason: `${p.label} 模式要求封装一致或同兼容族（原 ${pk.orig.value} vs 候选 ${pk.cand?.value}）` };
  }

  // 国产要求
  if (p.requireDomestic && !isDomestic(candidate.manufacturer, candidate.description))
    return { pass: false, reason: `国产替代模式：${candidate.manufacturer || "未知厂商"} 非国产品牌` };

  // 低成本：必须有**真实分销商**报价，AI 估价不得参与正式排名
  if (p.requirePriceKnown) {
    const m = candidate.market;
    const real = m && m.source === "distributor_api";
    if (!real)
      return { pass: true, downgrade: "NEEDS_VERIFICATION",
        reason: m?.source === "ai_estimate"
          ? "低成本模式：仅有 AI 估价，无真实分销商报价，不参与成本排名"
          : "低成本模式：无价格数据，无法比较成本" };
    const proc = ctx.procurement;
    if (proc?.inStockOnly && !(m.stockQty > 0 || /有货|充足/.test(m.stock || "")))
      return { pass: true, downgrade: "NEEDS_VERIFICATION", reason: "低成本模式：该候选当前无现货" };
  }

  // 证据覆盖率下限
  if (p.minEvidenceCoverage && scoreResult.evidenceCoverage < p.minEvidenceCoverage)
    return { pass: true, downgrade: "NEEDS_VERIFICATION",
      reason: `${p.label} 模式要求证据覆盖率 ≥${p.minEvidenceCoverage}%，实际 ${scoreResult.evidenceCoverage}%` };

  // 硬参数
  for (const re of (p.hardParams || [])) {
    const f = findParam(re);
    if (f && f.score && f.score.known && (f.score.score ?? 0) < 40)
      return { pass: false, reason: `${p.label} 模式：${f.orig.name} 不满足（${f.orig.value} vs ${f.cand?.value}）` };
  }
  return { pass: true };
}

module.exports = { PROFILES, applyProfile, weightsFor, isDomestic, CN_HINTS };
