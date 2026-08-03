const test = require("node:test");
const assert = require("node:assert/strict");
const { guardResource, pickVariants, variantKinship } = require("../api/_lib/part-identity");
const { formatValue, normalizeMultiValue } = require("../api/_lib/format");

test("回归：封装/3D 文件不得被身份守卫误拦", async t => {
  const id = { exactMpn: "STM32F103C8T6TR", requestedMpn: "STM32F103C8T6TR",
    baseDevice: "STM32F103", manufacturerName: "STMicroelectronics" };
  await t.test("STEP 按封装名命名 → 放行", () =>
    assert.equal(guardResource(id, { fname: "TQFP-48_7x7mm_P0.5mm.step", type: "model3d" }).ok, true));
  await t.test("kicad_mod 按封装名命名 → 放行", () =>
    assert.equal(guardResource(id, { fname: "TQFP-48_7x7mm_P0.5mm.kicad_mod", type: "footprint" }).ok, true));
  await t.test("QFN 封装名 → 放行", () =>
    assert.equal(guardResource(id, { fname: "QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm.step", type: "model3d" }).ok, true));
  await t.test("同器件 datasheet → 放行", () =>
    assert.equal(guardResource(id, { fname: "STM32F103C8T6.pdf", type: "datasheet" }).ok, true));
  await t.test("异器件 datasheet 仍被拦", () =>
    assert.equal(guardResource({ exactMpn: "LM358ADR", baseDevice: "LM358", manufacturerName: "TI" },
      { fname: "LM2904BAIPWR.pdf", type: "datasheet" }).ok, false));
  await t.test("异厂商仍被拦", () =>
    assert.equal(guardResource(id, { fname: "x.step", type: "model3d", manufacturer: "Texas Instruments" }).ok, false));
});

test("回归：变体列表不得混入不同规格器件", async t => {
  const all = ["STM32F103C4T6A", "STM32F103C6T6A", "STM32F103C6U6A", "STM32F103C8T6",
    "STM32F103C8T6TR", "STM32F103C8T6A", "STM32F103C8T7", "STM32F103RBT6"].map(pn => ({ partNumber: pn }));
  const r = pickVariants("STM32F103C8T6", all);
  const names = r.variants.map(v => v.partNumber);
  await t.test("只保留 C8T6 的直接变体", () => {
    assert.ok(names.includes("STM32F103C8T6TR"));
    assert.ok(names.includes("STM32F103C8T6A"));
  });
  await t.test("不同 Flash 容量的 C4/C6 被排除", () => {
    assert.ok(!names.includes("STM32F103C4T6A"), "16KB 器件不是 64KB 器件的变体");
    assert.ok(!names.includes("STM32F103C6T6A"), "32KB 器件不是 64KB 器件的变体");
  });
  await t.test("不同封装的 C6U6A 也被排除", () => assert.ok(!names.includes("STM32F103C6U6A")));
  await t.test("报告同系列另有多少个", () => assert.ok(r.familyCount > 0));

  await t.test("无直接变体时回退同系列", () => {
    const r2 = pickVariants("STM32F103C9T6", [{ partNumber: "STM32F103C8T6" }, { partNumber: "STM32F103C6T6" }]);
    assert.equal(r2.kinship, "same_family");
    assert.equal(r2.variants.length, 2);
  });

  const kin = [
    ["STM32F103C8T6", "STM32F103C8T6TR", "same_orderable"],
    ["STM32F103C8T6", "STM32F103C4T6A", "same_family"],
    ["AD8331ARQ-REEL7", "AD8331ARQ", "same_orderable"],
    ["TL431", "TL431ACDBVR", "same_device"],
    ["LM358", "AD8331", "unrelated"],
  ];
  for (const [a, b, want] of kin)
    await t.test(`${a} vs ${b} → ${want}`, () => assert.equal(variantKinship(a, b), want));
});

test("回归：ezPLM 多值分隔符 || ", async t => {
  await t.test("数值多值用 / 连接", () => assert.equal(normalizeMultiValue("105||85"), "105 / 85"));
  await t.test("文本多值用、连接", () =>
    assert.equal(normalizeMultiValue("Dual Watchdog||RTC||SysTick"), "Dual Watchdog、RTC、SysTick"));
  await t.test("单值不变", () => assert.equal(normalizeMultiValue("3.6"), "3.6"));
  await t.test("负数多值", () => assert.equal(normalizeMultiValue("-40||85"), "-40 / 85"));
  await t.test("配合单位", () => assert.equal(formatValue("105||85", "°C").text, "105 / 85 °C"));
});
