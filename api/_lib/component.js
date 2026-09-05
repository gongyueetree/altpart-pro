// component.js — v2: Improved AI lookup with evidence tracking

const { lookupPartSpecs } = require("./gemini");
const { sameParam, alignParams } = require("./param-align");
const { getDistributorPart } = require("./distributor");

async function fetchComponentFromAPIs(partNumber, referenceParams = []) {
  // 候选必须复用 distributor.js 的精确 MPN 守卫。旧实现这里是两个 TODO，
  // 导致原型号能查分销商、候选却直接退回 AI 记忆。
  try {
    const distributor = await getDistributorPart(partNumber);
    if (distributor?.parameters?.length) {
      const aligned = alignParams(distributor.parameters, referenceParams, {
        source: distributor._source || "distributor",
        sourceLabel: /^digikey/.test(distributor._source || "") ? "DigiKey" : "Mouser",
        confidence: "high",
      });
      const used = new Set(Object.values(aligned).map(x => x.matchedName).filter(Boolean));
      const extraParams = distributor.parameters.filter(x => !used.has(x.name))
        .map(x => ({ name: x.name, value: x.value, unit: x.unit || "" })).slice(0, 12);
      return { ...distributor, parameters: aligned, extraParams };
    }
  } catch (e) {
    console.warn(`[Distributor] ${partNumber}:`, e.message);
  }
  return fetchFromAI(partNumber, referenceParams);
}

async function fetchFromAI(partNumber, referenceParams) {
  if (!referenceParams.length) return null;
  try {
    const data = await lookupPartSpecs(partNumber, referenceParams);
    const parameters = {};
    let found = 0;
    referenceParams.forEach((ref, i) => {
      const key = `param_${i + 1}`;
      let val = data.params?.[key];
      if (!val && data.params) { const keys = Object.keys(data.params); if (keys[i]) val = data.params[keys[i]]; }
      if (!val && data.params) {
        val = Object.entries(data.params).find(([k, v]) =>
          sameParam(k, ref.name) || sameParam(String(v?.name || ""), ref.name))?.[1];
      }
      const value = val?.value ?? val?.v ?? "N/A";
      if (value !== "N/A") found++;
      parameters[ref.id] = {
        value, unit: val?.unit || ref.unit || "",
        source: "ai_search", sourceLabel: "AI搜索",
        confidence: value === "N/A" ? "none" : "low",
      };
    });
    console.log(`[AI] ${partNumber}: ${found}/${referenceParams.length} params`);
    return { partNumber: data.partNumber||partNumber, manufacturer: data.manufacturer||"", description: data.description||"", parameters, _source: "ai_search" };
  } catch (e) { console.warn(`[AI] Failed ${partNumber}:`, e.message); return null; }
}

module.exports = { fetchComponentFromAPIs };
