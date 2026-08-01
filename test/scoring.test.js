const test = require("node:test");
const assert = require("node:assert/strict");
const { compareParam, calculateScore, checkConstraint } = require("../api/_lib/scoring-node");

const P = (name, value, unit = "", nameEn = "") => ({ id: "p1", name, nameEn, value, unit });
const cmp = (p, v, meta = { source: "ezplm" }) => compareParam(p, v, meta);

test("回归：跨单位等值不再被判差距显著", async t => {
  await t.test("72 MHz vs 72000000 Hz → 100", () =>
    assert.equal(cmp(P("最高主频", "72", "MHz", "Max Frequency"), "72000000 Hz").score, 100));
  await t.test("3.3V vs 3300mV → 满分", () =>
    assert.ok(cmp(P("输出电压", "3.3", "V", "Output Voltage"), "3300 mV").score >= 92));
});

test("higher_better：更优不得扣分", async t => {
  await t.test("耐压 30V → 100V 得 100", () =>
    assert.equal(cmp(P("Vds(max)", "30", "V"), "100 V").score, 100));
  await t.test("带宽 1MHz → 10MHz 得 100", () =>
    assert.equal(cmp(P("增益带宽积", "1", "MHz", "GBW"), "10 MHz").score, 100));
  await t.test("Flash 64KB → 128KB 得 100", () =>
    assert.equal(cmp(P("Flash", "64", "KB"), "128 KB").score, 100));
  await t.test("耐压不足明显扣分", () =>
    assert.ok(cmp(P("Vds(max)", "100", "V"), "30 V").score < 40));
  await t.test("耐压略低在容差内", () =>
    assert.ok(cmp(P("Vds(max)", "100", "V"), "98 V").score >= 72));
});

test("lower_better：更低即更优", async t => {
  await t.test("静态电流 700µA → 50µA 得 100", () =>
    assert.equal(cmp(P("静态电流", "700", "uA", "Quiescent Current"), "50 uA").score, 100));
  await t.test("失调 2mV → 0.5mV 得 100", () =>
    assert.equal(cmp(P("输入失调电压", "2", "mV", "Vos"), "0.5 mV").score, 100));
  await t.test("噪声 8nV → 1nV 得 100", () =>
    assert.equal(cmp(P("等效输入噪声", "8", "nV", "Noise"), "1 nV").score, 100));
  await t.test("静态电流升高明显扣分", () =>
    assert.ok(cmp(P("静态电流", "50", "uA", "Quiescent"), "700 uA").score < 40));
});

test("range_cover：端点覆盖而非中点", async t => {
  const temp = P("工作温度", "-40 to 85", "°C", "Operating Temperature");
  await t.test("-40~125 完全覆盖 -40~85", () => assert.equal(cmp(temp, "-40 to 125 °C").score, 100));
  await t.test("0~70 不覆盖", () => assert.ok(cmp(temp, "0 to 70 °C").score < 40));
  await t.test("-55~150 完全覆盖", () => assert.equal(cmp(temp, "-55 to 150 °C").score, 100));
  await t.test("中点相同但范围窄 → 不得满分", () => assert.ok(cmp(temp, "10 to 35 °C").score < 60));
  await t.test("工作电压覆盖", () =>
    assert.equal(cmp(P("工作电压", "2.0 to 3.6", "V", "Supply Voltage"), "1.8 to 5.5 V").score, 100));
});

test("exact：必须完全相同", async t => {
  await t.test("通道数 2 vs 2", () => assert.equal(cmp(P("通道数", "2", "", "Channels"), "2").score, 100));
  await t.test("通道数 2 vs 4 低分", () => assert.ok(cmp(P("通道数", "2", "", "Channels"), "4").score < 20));
  await t.test("分辨率 12 vs 16 低分", () => assert.ok(cmp(P("分辨率", "12", "Bits", "Resolution"), "16 Bits").score < 20));
});

test("conditioned：测试条件不同不得直接比较", async t => {
  const r = cmp(P("Rds(on)", "12 mΩ @ Vgs=10V"), "8 mΩ @ Vgs=4.5V");
  await t.test("分数被压低", () => assert.ok(r.score <= 55));
  await t.test("给出条件不一致说明", () => assert.ok(/测试条件/.test(r.comment)));
  await t.test("记录 conditionMismatch", () => assert.ok(r.conditionMismatch));
  await t.test("条件相同则正常比较", () => {
    const ok = cmp(P("Rds(on)", "12 mΩ @ Vgs=10V"), "8 mΩ @ Vgs=10V");
    assert.equal(ok.score, 100); assert.equal(ok.conditionMismatch, null);
  });
});

test("compatible_set：封装兼容族", async t => {
  await t.test("SOIC-8 vs SOIC-8", () => assert.equal(cmp(P("封装", "SOIC-8", "", "Package"), "SOIC-8").score, 100));
  await t.test("SOIC-8 vs SOP-8 同族", () => assert.ok(cmp(P("封装", "SOIC-8", "", "Package"), "SOP-8").score >= 80));
  await t.test("SOIC-8 vs QFN-16 不兼容", () => assert.ok(cmp(P("封装", "SOIC-8", "", "Package"), "QFN-16").score < 20));
});

test("缺失值", async t => {
  for (const v of ["N/A", "", null, undefined])
    await t.test(`${JSON.stringify(v)} → known=false, score=null`, () => {
      const r = cmp(P("增益带宽积", "1", "MHz"), v);
      assert.equal(r.known, false); assert.equal(r.score, null);
    });
});

test("硬约束：缺失不得绕过", async t => {
  const params = [P("工作温度", "-40 to 85", "°C", "Operating Temperature")];
  params[0].id = "p1";
  const cons = { p1: { constraintType: "hard", min: "-40", max: "125" } };
  await t.test("硬约束参数缺失 → NEEDS_VERIFICATION 且不进正常排名", () => {
    const r = calculateScore(params, { parameters: { p1: { value: "N/A" } } }, ["p1"], cons);
    assert.equal(r.needsVerification, true);
    assert.equal(r.replacementLevel.level, "NEEDS_VERIFICATION");
  });
  await t.test("硬约束已知且违反 → REJECTED", () => {
    const r = calculateScore(params, { parameters: { p1: { value: "0 to 70 °C", source: "ezplm" } } }, ["p1"], cons);
    assert.equal(r.rejected, true);
    assert.equal(r.replacementLevel.level, "REJECTED");
  });
  await t.test("硬约束满足 → 不拒绝", () => {
    const r = calculateScore(params, { parameters: { p1: { value: "-40 to 125 °C", source: "ezplm" } } }, ["p1"], cons);
    assert.equal(r.rejected, false); assert.equal(r.needsVerification, false);
  });
});

test("checkConstraint 单元", async t => {
  await t.test("范围内通过", () => assert.equal(checkConstraint({ min: "1", max: "10" }, "5", "V"), true));
  await t.test("超上限失败", () => assert.equal(checkConstraint({ min: "1", max: "10" }, "50", "V"), false));
  await t.test("低于下限失败", () => assert.equal(checkConstraint({ min: "1", max: "10" }, "0.5", "V"), false));
  await t.test("跨单位仍正确", () => assert.equal(checkConstraint({ min: "1", max: "10" }, "5000 mV", "V"), true));
  await t.test("缺失值返回 null", () => assert.equal(checkConstraint({ min: "1" }, "N/A", "V"), null));
  await t.test("枚举命中", () => assert.equal(checkConstraint({ options: ["SOIC", "TSSOP"] }, "SOIC-8", ""), true));
  await t.test("枚举未命中", () => assert.equal(checkConstraint({ options: ["SOIC"] }, "QFN-16", ""), false));
});

test("无 Pin Map 证据不得判直接替代", async t => {
  const params = [{ id: "a", name: "内核", nameEn: "Core", value: "ARM Cortex-M3", unit: "" },
                  { id: "b", name: "封装", nameEn: "Package", value: "LQFP-48", unit: "" },
                  { id: "c", name: "Flash", nameEn: "Flash", value: "64", unit: "KB" }];
  const cand = { parameters: {
    a: { value: "ARM Cortex-M3", source: "ezplm" },
    b: { value: "LQFP-48", source: "ezplm" },
    c: { value: "64 KB", source: "ezplm" } } };
  await t.test("pinVerified=false → COMPATIBLE_WITH_REVIEW", () => {
    const r = calculateScore(params, cand, ["a", "b", "c"]);
    assert.notEqual(r.replacementLevel.level, "DIRECT_REPLACEMENT");
    assert.equal(r.replacementLevel.level, "COMPATIBLE_WITH_REVIEW");
  });
  await t.test("pinVerified=true → DIRECT_REPLACEMENT", () => {
    const r = calculateScore(params, { ...cand, pinVerified: true }, ["a", "b", "c"]);
    assert.equal(r.replacementLevel.level, "DIRECT_REPLACEMENT");
  });
});

test("未验证型号不得进入高可信推荐", async t => {
  const params = [{ id: "a", name: "内核", value: "ARM Cortex-M3", unit: "" }];
  const r = calculateScore(params, { unverified: true, parameters: { a: { value: "ARM Cortex-M3", source: "ai_search" } } }, ["a"]);
  await t.test("标记 NEEDS_VERIFICATION", () => assert.equal(r.replacementLevel.level, "NEEDS_VERIFICATION"));
});

test("AI 来源显著降权", async t => {
  const params = [{ id: "a", name: "增益带宽积", nameEn: "GBW", value: "1", unit: "MHz" }];
  const mk = src => calculateScore(params, { parameters: { a: { value: "1 MHz", source: src } } }, ["a"]).confidence;
  await t.test("ezplm 高于 ai_search", () => assert.ok(mk("ezplm") > mk("ai_search")));
  await t.test("ai_search 触发 ≤70 封顶", () => assert.ok(mk("ai_search") <= 70));
});
