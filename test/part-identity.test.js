const test = require("node:test");
const assert = require("node:assert/strict");
const { splitMpn, resolveIdentity, identityCacheKey, guardResource,
        canonicalManufacturer, dedupeManufacturers } = require("../api/_lib/part-identity");

test("MPN 拆解", async t => {
  const cs = [
    ["TPS62160DGKR", "TPS62160", null],
    ["AD8331ARQ-REEL7", "AD8331", "REEL7"],
    ["LM358ADR", "LM358", null],
    ["STM32F103C8T6", "STM32F103", null],
    ["TL431", "TL431", null],
    ["VCA2615Y/2K5", "VCA2615", "2K5"],
  ];
  for (const [mpn, base, suffix] of cs)
    await t.test(`${mpn} → base=${base} suffix=${suffix}`, () => {
      const r = splitMpn(mpn);
      assert.equal(r.baseDevice, base);
      assert.equal(r.orderableSuffix, suffix);
    });
});

test("线上缺陷：TL431 不得被静默替换成 TL431-1", async t => {
  const records = [{ partNumber: "TL431-1", manufacturer: "TI" }, { partNumber: "TL431ACDR", manufacturer: "TI" }];
  const id = resolveIdentity("TL431", records);
  await t.test("exactMpn 为空（因为库里没有 TL431 本身）", () => assert.equal(id.exactMpn, null));
  await t.test("matchType 不得是 exact", () => assert.notEqual(id.matchType, "exact"));
  await t.test("requestedMpn 保留用户原始输入", () => assert.equal(id.requestedMpn, "TL431"));
  await t.test("baseDevice 正确", () => assert.equal(id.baseDevice, "TL431"));
});

test("exact MPN 优先，不被变体顶替", async t => {
  const records = [
    { partNumber: "STM32F103C8T6TR", manufacturer: "ST" },
    { partNumber: "STM32F103C8T6", manufacturer: "ST" },
    { partNumber: "STM32F103C8T7", manufacturer: "ST" },
  ];
  const id = resolveIdentity("STM32F103C8T6", records);
  await t.test("命中 exact", () => assert.equal(id.matchType, "exact"));
  await t.test("exactMpn 是输入本身", () => assert.equal(id.exactMpn, "STM32F103C8T6"));
});

test("AD8331ARQ-REEL7：包装后缀差异视为同一订货体", async t => {
  const records = [{ partNumber: "AD8331ARQ", manufacturer: "Analog Devices", footprint: "SSOP-20" }];
  const id = resolveIdentity("AD8331ARQ-REEL7", records);
  await t.test("识别为 exact（仅差包装）", () => assert.equal(id.matchType, "exact"));
  await t.test("保留 orderableSuffix", () => assert.equal(id.orderableSuffix, "REEL7"));
});

test("无任何记录 → unverified", async t => {
  const id = resolveIdentity("NOT_A_REAL_PART_12345", []);
  await t.test("matchType=unverified", () => assert.equal(id.matchType, "unverified"));
  await t.test("exactMpn 为空", () => assert.equal(id.exactMpn, null));
});

test("缓存键必须含厂商与封装（防 LM358 式污染）", async t => {
  const a = identityCacheKey("detail", { exactMpn: "LM358ADR", manufacturerName: "Texas Instruments", packageCode: "SOIC-8" });
  const b = identityCacheKey("detail", { exactMpn: "LM358ADR", manufacturerName: "STMicroelectronics", packageCode: "SOIC-8" });
  const c = identityCacheKey("detail", { exactMpn: "LM358ADR", manufacturerName: "Texas Instruments", packageCode: "TSSOP-8" });
  await t.test("不同厂商 → 不同键", () => assert.notEqual(a, b));
  await t.test("不同封装 → 不同键", () => assert.notEqual(a, c));
  await t.test("相同身份 → 相同键", () =>
    assert.equal(a, identityCacheKey("detail", { exactMpn: "LM358ADR", manufacturerName: "TI", packageCode: "SOIC-8" })));
});

test("资源身份守卫：拦截 LM358ADR 页面里的异物", async t => {
  const identity = { exactMpn: "LM358ADR", requestedMpn: "LM358ADR",
    baseDevice: "LM358", manufacturerName: "Texas Instruments" };
  await t.test("LM2904BAIPWR.pdf 被拒", () => {
    const r = guardResource(identity, { fname: "LM2904BAIPWR.pdf" });
    assert.equal(r.ok, false); assert.equal(r.code, "RESOURCE_IDENTITY_MISMATCH");
  });
  await t.test("LM258DT.pdf 被拒", () => {
    const r = guardResource(identity, { fname: "LM258DT.pdf" });
    assert.equal(r.ok, false);
  });
  await t.test("ST 厂商资源被拒", () => {
    const r = guardResource(identity, { manufacturer: "STMicroelectronics", fname: "LM358A.pdf" });
    assert.equal(r.ok, false); assert.match(r.reason, /厂商/);
  });
  await t.test("同厂同器件资源通过", () => {
    const r = guardResource(identity, { manufacturer: "Texas Instruments", fname: "lm358.pdf" });
    assert.equal(r.ok, true);
  });
  await t.test("同基础器件不同后缀通过", () => {
    const r = guardResource(identity, { partNumber: "LM358ADR", fname: "lm358a-q1.pdf" });
    assert.equal(r.ok, true);
  });
});

test("厂商 canonical 去重", async t => {
  await t.test("大小写归一", () =>
    assert.equal(canonicalManufacturer("Texas Instruments"), canonicalManufacturer("texas instruments")));
  await t.test("别名归一 TI", () =>
    assert.equal(canonicalManufacturer("TI"), canonicalManufacturer("Texas Instruments Incorporated")));
  await t.test("ADI 别名", () =>
    assert.equal(canonicalManufacturer("Linear Technology"), canonicalManufacturer("Analog Devices")));
  await t.test("列表去重", () => {
    const r = dedupeManufacturers(["Texas Instruments", "texas instruments", "TI", "Analog Devices"]);
    assert.equal(r.length, 2);
  });
  await t.test("不同厂商不合并", () =>
    assert.notEqual(canonicalManufacturer("Texas Instruments"), canonicalManufacturer("STMicroelectronics")));
});
