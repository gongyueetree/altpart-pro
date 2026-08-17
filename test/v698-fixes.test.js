// v6.9.8 回归测试：3D 渲染调性对齐 SamacSys（ACES + 材质数值 + 棱线减噪）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "public/index.src.html"), "utf8");

test("3D 渲染调性", async t => {
  await t.test("ACES 色调映射已开启（默认 NoToneMapping 是发灰主因）", () => {
    assert.match(SRC, /renderer\.toneMapping=THREE\.ACESFilmicToneMapping/);
    assert.match(SRC, /toneMappingExposure=1\.15/);
    assert.match(SRC, /outputColorSpace=THREE\.SRGBColorSpace/);
  });
  await t.test("材质数值：本体近黑哑光，引脚亮银抛光", () => {
    assert.match(SRC, /bodyMat=new THREE\.MeshStandardMaterial\(\{color:0x2e3237,metalness:\.05,roughness:\.82,envMapIntensity:\.9/);
    assert.match(SRC, /pinMat=new THREE\.MeshStandardMaterial\(\{color:0xd5d8dc,metalness:\.9,roughness:\.28,envMapIntensity:1\.25/);
  });
  await t.test("棱线减噪：阈值 30°、透明度 .3（曲面引脚 25° 会出碎线）", () => {
    assert.match(SRC, /new THREE\.EdgesGeometry\(part\.geo,30\)/);
    assert.match(SRC, /opacity:\.3\}/);
  });
});
