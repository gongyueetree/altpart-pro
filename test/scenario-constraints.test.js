const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateScore, checkConstraint } = require("../api/_lib/scoring-node");
const { scenarioHardParams } = require("../api/_lib/applications");

test("场景硬约束进入过滤", async t => {
  const params = [
    { id: "iq", name: "静态电流", nameEn: "Quiescent Current", value: "17", unit: "uA" },
    { id: "v", name: "工作电压", nameEn: "Supply Voltage", value: "3 to 17", unit: "V" },
  ];
  await t.test("battery 场景识别出硬约束参数", () => {
    const ids = scenarioHardParams(params, "battery");
    assert.ok(ids.includes("iq"), "静态电流应为电池场景硬约束");
  });
  const con = { iq: { constraintType: "hard", scenario: "battery", notWorseThanOriginal: true } };

  await t.test("Iq 更低 → 通过", () => {
    const r = calculateScore(params, { parameters: {
      iq: { value: "5 uA", source: "ezplm" }, v: { value: "3 to 17 V", source: "ezplm" } } }, ["iq", "v"], con);
    assert.equal(r.rejected, false);
  });
  await t.test("Iq 显著升高 → 被拒并说明场景", () => {
    const r = calculateScore(params, { parameters: {
      iq: { value: "900 uA", source: "ezplm" }, v: { value: "3 to 17 V", source: "ezplm" } } }, ["iq", "v"], con);
    assert.equal(r.rejected, true);
    assert.match(r.rejectReason, /battery|场景/);
  });
  await t.test("Iq 缺失 → NEEDS_VERIFICATION 而非放行", () => {
    const r = calculateScore(params, { parameters: {
      iq: { value: "N/A" }, v: { value: "3 to 17 V", source: "ezplm" } } }, ["iq", "v"], con);
    assert.equal(r.needsVerification, true);
  });
  await t.test("checkConstraint 直判", () => {
    assert.equal(checkConstraint({ notWorseThanOriginal: true }, "5 uA", "uA", { compareScore: 100 }), true);
    assert.equal(checkConstraint({ notWorseThanOriginal: true }, "900 uA", "uA", { compareScore: 15 }), false);
    assert.equal(checkConstraint({ notWorseThanOriginal: true }, "5 uA", "uA", {}), null);
  });
});
