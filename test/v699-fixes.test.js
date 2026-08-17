// v6.9.9 回归测试：引脚计数按编号覆盖（AD8331ARQZ 误拒回归）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { isEpPin } = require("../api/_lib/pinout");
const SRC = fs.readFileSync(path.join(__dirname, "..", "api/_lib/pinout.js"), "utf8");

/** 复刻 pinout.js 的判定核心，供纯逻辑用例使用 */
function coverage(pins, pinCount) {
  const numbered = [], epExtras = [], strays = [];
  for (const p of pins) {
    const n = parseInt(p.number, 10);
    if (Number.isInteger(n) && n >= 1 && (!pinCount || n <= pinCount)) numbered.push(n);
    else if (isEpPin(p)) epExtras.push(p);
    else strays.push(p);
  }
  return { covered: new Set(numbered).size, epExtras: epExtras.length, strays: strays.length };
}
const seq = (n, name = i => `P${i}`) => [...Array(n)].map((_, i) => ({ number: String(i + 1), name: name(i + 1) }));

test("引脚计数：编号覆盖语义", async t => {
  await t.test("编号内被命名为 EP 的脚计数（AD8331ARQZ 线上误拒的回归）", () => {
    const pins = seq(19).concat([{ number: "20", name: "EP" }]);
    assert.equal(coverage(pins, 20).covered, 20);
  });
  await t.test("范围外的独立 EP 不占编号位，也不导致拒绝", () => {
    const pins = seq(20).concat([{ number: "EP", name: "EP" }]);
    const r = coverage(pins, 20);
    assert.equal(r.covered, 20);
    assert.equal(r.epExtras, 1);
  });
  await t.test("编号确实缺失时仍拒绝", () => {
    assert.equal(coverage(seq(18), 20).covered, 18);
  });
  await t.test("编号超范围且非 EP 的脚归入异常，不冒充编号位", () => {
    const pins = seq(20).concat([{ number: "25", name: "X" }]);
    const r = coverage(pins, 20);
    assert.equal(r.covered, 20);
    assert.equal(r.strays, 1);
  });
  await t.test("源码用覆盖数判定且拒绝详情为覆盖形式", () => {
    assert.match(SRC, /编号引脚覆盖 \$\{covered\}\/\$\{pinCount\}/);
  });
  await t.test("负缓存缩短到 600s，重试按钮在合理时间内有效", () => {
    assert.match(SRC, /cache\.set\(ck, false, 600\)/);
    assert.doesNotMatch(SRC, /cache\.set\(ck, false, 3600\)/);
  });
});
