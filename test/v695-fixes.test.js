// v6.9.5 回归测试：detailOf 作用域崩溃 / AI 引脚两段式 / 3D 剖分精度
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PIPELINE = fs.readFileSync(path.join(__dirname, "..", "api/_lib/pipeline.js"), "utf8");
const PINOUT = fs.readFileSync(path.join(__dirname, "..", "api/_lib/pinout.js"), "utf8");
const SRC = fs.readFileSync(path.join(__dirname, "..", "public/index.src.html"), "utf8");

test("detailOf 作用域崩溃（req_mswq0cdhxf6r1i 回归）", async t => {
  await t.test("淘汰详情构造器已提到所有循环之外", () => {
    // detailOf 只允许出现在注释里；实际调用一律 buildDetail
    const codeOnly = PIPELINE.replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(codeOnly, /detailOf/);
    assert.match(PIPELINE, /const buildDetail = result =>/);
  });

  await t.test("端到端：全部低分→救回→模式门槛拦截，不再崩", async () => {
    // 用 require 缓存注入 stub 走真实 pipeline（形状取自真实产出：批量查询返回数组参数）
    const L = f => path.resolve(__dirname, "..", "api/_lib", f);
    const saved = {};
    const stub = (f, exp) => {
      const id = require.resolve(L(f));
      saved[id] = require.cache[id];
      require.cache[id] = { exports: exp, loaded: true, id, paths: [] };
    };
    const pipeId = require.resolve(L("pipeline.js"));
    const savedPipe = require.cache[pipeId];
    delete require.cache[pipeId];
    try {
      stub("gemini.js", {
        analyzeComponent: async () => ({}),
        getCandidates: async () => ({ candidates: [{ pn: "NE5532P" }], eliminated: [] }),
        lookupPartSpecs: async () => ({}), callGemini: async () => "{}", repairJSON: x => JSON.parse(x),
      });
      const params = [
        { id: "p1", name: "带宽", nameEn: "Bandwidth", value: "10", unit: "MHz" },
        { id: "p2", name: "封装", nameEn: "Package", value: "SOIC-8", unit: "" },
      ];
      stub("ezplm.js", {
        queryLocalDB: async () => ({ partNumber: "OPA2134", manufacturer: "Texas Instruments",
          category: "运算放大器", description: "音频运放", parameters: params, _source: "ezplm" }),
        queryLocalDBBatch: async pns => Object.fromEntries(pns.map(pn => [pn.toUpperCase(), {
          partNumber: pn, manufacturer: "Texas Instruments", description: "双运放", _source: "ezplm",
          parameters: [{ name: "带宽", value: "N/A" }, { name: "封装", value: "N/A" }],
        }])),
        searchParts: async () => [],
      });
      stub("component.js", { fetchComponentFromAPIs: async () => null });

      const { runPipeline } = require(pipeId);
      const r = await runPipeline({ partNumber: "OPA2134", mode: "domestic", priorityOrder: ["p1", "p2"] });
      assert.ok(Array.isArray(r.recommendations));
      assert.ok((r.eliminated || []).some(e => e.stage === "mode_gate"),
        "救回的境外候选应被 domestic 门槛以 mode_gate 淘汰（旧代码在此崩溃）");
    } finally {
      for (const [id, m] of Object.entries(saved)) {
        if (m) require.cache[id] = m; else delete require.cache[id];
      }
      if (savedPipe) require.cache[pipeId] = savedPipe; else delete require.cache[pipeId];
    }
  });
});

test("AI 引脚两段式调用", async t => {
  await t.test("先联网检索（8192 预算）后模型记忆兜底", () => {
    assert.match(PINOUT, /callGemini\(sys, `查询 \$\{partNumber\} 的引脚定义`, 8192, true\)/);
    assert.match(PINOUT, /callGemini\(sys, `查询 \$\{partNumber\} 的引脚定义`, 4096, false\)/);
    // 兜底必须在检索结果为空/解析失败时触发
    assert.match(PINOUT, /if \(!data\?\.pins\?\.length\) \{\s*stage = "memory"/);
  });
  await t.test("结果标注产出阶段，兜底路径给出更低可信度提示", () => {
    assert.match(PINOUT, /stage,\s+\/\/ grounded/);
    assert.match(PINOUT, /模型记忆（联网检索未获结果）/);
  });
});

test("3D：剖分精度与法线容错", async t => {
  await t.test("ReadStepFile 传入精细剖分参数（对齐 KiCad 的 OCCT 设置）", () => {
    assert.match(SRC, /linearDeflectionType:"bounding_box_ratio"/);
    assert.match(SRC, /linearDeflection:0\.0005/);
    assert.match(SRC, /angularDeflection:0\.3/);
    assert.doesNotMatch(SRC, /ReadStepFile\(bytes,null\)/);
  });
  await t.test("参数名与 occt-import-js wasm 内嵌名一致", () => {
    const wasmPath = path.join(__dirname, "..", "node_modules/occt-import-js/dist/occt-import-js.wasm");
    if (!fs.existsSync(wasmPath)) return;   // occt 是可选依赖（npm run vendor 时安装）
    const wasm = fs.readFileSync(wasmPath).toString("latin1");
    for (const name of ["linearUnit", "linearDeflectionType", "linearDeflection", "angularDeflection", "bounding_box_ratio"])
      assert.ok(wasm.includes(name), `wasm 中应存在参数名 ${name}`);
  });
  await t.test("双面材质，容忍 OCCT 局部反向法线", () => {
    assert.match(SRC, /side:THREE\.DoubleSide/);
  });
});
