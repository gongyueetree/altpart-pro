// v6.9.6 回归测试：3D 环境贴图 + 渲染诊断 + 版本自检
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "public/index.src.html"), "utf8");

test("3D：环境贴图与渲染诊断", async t => {
  await t.test("RoomEnvironment IBL 已接入且可选降级", () => {
    assert.match(SRC, /RoomEnvironment/);
    assert.match(SRC, /PMREMGenerator/);
    assert.match(SRC, /dynImport\(ENV_CDN\)\.catch\(\(\)=>null\)/);   // CDN 失败仍可渲染
  });
  await t.test("renderer 先于 PMREM 创建（原顺序是 TDZ 崩溃）", () => {
    const iRenderer = SRC.indexOf("const renderer=createRenderer(THREE)");
    const iPmrem = SRC.indexOf("new THREE.PMREMGenerator(renderer)");
    assert.ok(iRenderer > -1 && iPmrem > -1 && iRenderer < iPmrem,
      "createRenderer 必须出现在 PMREMGenerator 之前");
  });
  await t.test("ready 行携带三角形数/解析时长/版本 —— 截图即可判断新代码是否生效", () => {
    assert.match(SRC, /三角形 · 解析 \{stats3d\?\.parseMs\?\?0\}ms/);
    assert.match(SRC, /· v\{APP_VERSION\} ·/);
    assert.match(SRC, /环境贴图未加载\(质感降级\)/);
  });
  await t.test("pmrem 随视图销毁释放", () => {
    assert.match(SRC, /pmrem\?\.dispose\(\)/);
  });
});

test("版本自检：页面落后于服务端时提示刷新", async t => {
  await t.test("挂载时对比 /api/health 版本", () => {
    assert.match(SRC, /fetch\("\/api\/health"\)/);
    assert.match(SRC, /server&&server!==APP_VERSION/);
  });
  await t.test("落后时显示刷新横幅", () => {
    assert.match(SRC, /落后于服务端 v\{staleVer\}/);
    assert.match(SRC, /location\.reload/);
  });
});
