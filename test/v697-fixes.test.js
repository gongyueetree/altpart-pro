// v6.9.7 回归测试：SamacSys 式 3D 呈现（本体/引脚分材 + 棱线）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "public/index.src.html"), "utf8");

test("3D 呈现：分材质与棱线", async t => {
  await t.test("体积启发式：最大网格为本体，其余为引脚", () => {
    assert.match(SRC, /const isBody=part\.vol>=maxVol\*0\.5/);
    assert.match(SRC, /bodyMat=new THREE\.MeshStandardMaterial\(\{color:0x3a3f45/);
    assert.match(SRC, /pinMat=new THREE\.MeshStandardMaterial\(\{color:0xc8ccd2,metalness:\.85/);
  });
  await t.test("STEP 自带多色时尊重原色，单色/无色才用启发式", () => {
    assert.match(SRC, /distinctColors\.size>=2/);
    assert.match(SRC, /useStepColors&&part\.stepColor/);
  });
  await t.test("棱线绘制（EdgesGeometry），超大模型自动关闭", () => {
    assert.match(SRC, /new THREE\.EdgesGeometry\(part\.geo,25\)/);
    assert.match(SRC, /drawEdges=triCount<200000/);
  });
  await t.test("销毁时逐一释放几何与材质（边线让几何翻倍）", () => {
    assert.match(SRC, /group\.traverse\(o=>\{o\.geometry\?\.dispose/);
  });
  await t.test("旧的单一灰色材质路径已移除", () => {
    assert.doesNotMatch(SRC, /new THREE\.Color\(0x8a8f98\)/);
  });
});
