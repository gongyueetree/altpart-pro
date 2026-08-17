// v6.9.2 回归测试：候选合并 / 优先级生效 / 国产替代错误分类 / 资源代理 / AI 引脚 EP
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { mergeCandidates, sourceRank, hasValue } = require("../api/_lib/candidate-merge");
const { isEpPin } = require("../api/_lib/pinout");

const SRC = fs.readFileSync(path.join(__dirname, "..", "public", "index.src.html"), "utf8");

// ─────────────────────────────────────────────────────────────
test("重复候选按 MPN + 厂商合并", async t => {
  const p = (name, value, unit = "") => ({ name, value, unit });

  await t.test("同一颗料的不同写法合并为一条", () => {
    const { merged, duplicates } = mergeCandidates([
      { partNumber: "LM358DR", manufacturer: "Texas Instruments", _source: "ai_search", parameters: [p("供电电压", "32", "V")] },
      { partNumber: "lm358-dr", manufacturer: "TI", _source: "ezplm", parameters: [p("带宽", "1.1", "MHz")] },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(duplicates.length, 1);
  });

  await t.test("合并后参数取并集，不再各持半份", () => {
    const { merged } = mergeCandidates([
      { partNumber: "LM358DR", manufacturer: "TI", _source: "ai_search", parameters: [p("供电电压", "32", "V")] },
      { partNumber: "LM358DR", manufacturer: "TI", _source: "ezplm", parameters: [p("带宽", "1.1", "MHz")] },
    ]);
    const names = merged[0].parameters.map(x => x.name);
    assert.ok(names.includes("供电电压"));
    assert.ok(names.includes("带宽"));
  });

  await t.test("值冲突时保留高优先级来源（ezPLM 胜 AI）", () => {
    const { merged } = mergeCandidates([
      { partNumber: "LM358DR", manufacturer: "TI", _source: "ai_search", parameters: [p("供电电压", "32", "V")] },
      { partNumber: "LM358DR", manufacturer: "TI", _source: "ezplm", parameters: [p("供电电压", "36", "V")] },
    ]);
    const v = merged[0].parameters.find(x => x.name === "供电电压");
    assert.equal(v.value, "36");
    assert.equal(merged[0]._paramConflicts.length, 1);
    assert.equal(merged[0]._paramConflicts[0].dropped.value, "32");
  });

  await t.test("N/A 不覆盖已有真实值，也会被真实值补上", () => {
    const { merged } = mergeCandidates([
      { partNumber: "X1", manufacturer: "SGMicro", _source: "ezplm", parameters: [p("带宽", "N/A")] },
      { partNumber: "X1", manufacturer: "SGMicro", _source: "digikey", parameters: [p("带宽", "1.1", "MHz")] },
    ]);
    assert.equal(merged[0].parameters.find(x => x.name === "带宽").value, "1.1");
  });

  await t.test("不同厂商的同名 MPN 不合并", () => {
    const { merged } = mergeCandidates([
      { partNumber: "LM358", manufacturer: "Texas Instruments", _source: "ezplm", parameters: [] },
      { partNumber: "LM358", manufacturer: "STMicroelectronics", _source: "ezplm", parameters: [] },
    ]);
    assert.equal(merged.length, 2);
  });

  await t.test("不同型号互不影响，且保留首次出现顺序", () => {
    const { merged } = mergeCandidates([
      { partNumber: "A1", manufacturer: "TI", _source: "ezplm", parameters: [] },
      { partNumber: "B2", manufacturer: "TI", _source: "ezplm", parameters: [] },
      { partNumber: "a-1", manufacturer: "TI", _source: "ai_search", parameters: [] },
    ]);
    assert.deepEqual(merged.map(m => m.partNumber), ["A1", "B2"]);
  });

  await t.test("来源优先级：ezPLM > 分销商 > AI", () => {
    assert.ok(sourceRank("ezplm") > sourceRank("digikey"));
    assert.ok(sourceRank("digikey") > sourceRank("ai_search"));
    assert.ok(sourceRank("mouser") > sourceRank("ai_search"));
  });

  await t.test("hasValue 正确识别空值形态", () => {
    assert.equal(hasValue({ value: "1.1" }), true);
    for (const v of ["", "N/A", "n/a", "未知", "--", null, undefined])
      assert.equal(hasValue({ value: v }), false, `${v} 应判为无值`);
  });
});

// ─────────────────────────────────────────────────────────────
test("参数优先级真正影响候选检索", async t => {
  await t.test("提示词按优先级列出关键参数并声明第一优先项", async () => {
    let captured = null;
    const gp = path.resolve(__dirname, "..", "api/_lib/gemini.js");
    delete require.cache[gp];
    const gemini = require(gp);
    // 直接检查源码：提示词必须包含优先级声明
    const src = fs.readFileSync(gp, "utf8");
    assert.match(src, /参数优先级（用户按重要性排序/);
    assert.match(src, /按用户优先级排序/);
    assert.ok(typeof gemini.getCandidates === "function");
    void captured;
  });

  await t.test("候选缓存键包含优先级与优选厂商", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/_lib/pipeline.js"), "utf8");
    // 键必须由 prio 与 mfrKey 参与构造，否则改优先级后仍命中旧候选
    assert.match(src, /const prio = orderedParams\.slice\(0, 6\)\.map\(p => p\.id\)\.join\(">"\)/);
    assert.match(src, /cand10:\$\{partNumber\}:\$\{mode\}:\$\{scenario \|\| ""\}:\$\{application\}:\$\{prio\}:\$\{mfrKey\}/);
  });

  await t.test("传给 getCandidates 的是重排后的参数", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/_lib/pipeline.js"), "utf8");
    assert.match(src, /getCandidates\(original, original\.category, orderedParams,/);
  });
});

// ─────────────────────────────────────────────────────────────
test("候选全部查不到数据是业务结果，不是 INTERNAL_ERROR", async t => {
  await t.test("NO_CANDIDATE_DATA 已注册且不可重试", () => {
    const { bizFail } = require("../api/_lib/http");
    const res = mockRes();
    bizFail(res, "NO_CANDIDATE_DATA", "2 个候选均查不到参数", { requestId: "req_x" });
    assert.equal(res._status, 200);
    assert.equal(res._body.error.code, "NO_CANDIDATE_DATA");
    assert.equal(res._body.error.retryable, false);
  });

  await t.test("pipeline 抛出的错误带 noCandidateData 标记与候选清单", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/_lib/pipeline.js"), "utf8");
    assert.match(src, /err\.noCandidateData = true/);
    assert.match(src, /err\.candidates = candidatePNs/);
    assert.doesNotMatch(src, /throw new Error\("所有候选型号均无法获取参数"\)/);
  });

  await t.test("recommend 在分类为 INTERNAL_ERROR 之前先处理该标记", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/v2/recommend.js"), "utf8");
    const iNoData = src.indexOf("e.noCandidateData");
    const iInternal = src.indexOf('"INTERNAL_ERROR"');
    assert.ok(iNoData > -1 && iNoData < iInternal, "noCandidateData 分支必须在兜底分类之前");
    assert.match(src, /国产型号常未被 ezPLM 收录/);
  });

  await t.test("前端不再吞掉后端 message", () => {
    assert.doesNotMatch(SRC, /ERR_TEXT\[e\.code\]\|\|e\.message\|\|"推荐失败"/);
    assert.match(SRC, /const label=ERR_TEXT\[e\.code\]\|\|"推荐失败"/);
    assert.match(SRC, /NO_CANDIDATE_DATA:/);
  });
});

// ─────────────────────────────────────────────────────────────
test("AI 引脚：EP 焊盘不计入编号引脚数", async t => {
  await t.test("识别各种散热焊盘写法", () => {
    for (const n of ["EP", "ep", "PAD", "Thermal Pad", "exposed_pad", "TAB", "DAP"])
      assert.equal(isEpPin({ name: n, number: "9" }), true, `${n} 应识别为 EP`);
  });
  await t.test("常规信号引脚不被误判为 EP", () => {
    for (const n of ["VCC", "GND", "OUT", "IN+", "GAIN", "MODE"])
      assert.equal(isEpPin({ name: n, number: "1" }), false, `${n} 不应判为 EP`);
  });
  await t.test("引脚数校验排除 EP 后再比较", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/_lib/pinout.js"), "utf8");
    assert.match(src, /const numbered = pins\.filter\(p => !isEpPin\(p\)\)/);
    assert.match(src, /numbered\.length !== pinCount/);
  });
  await t.test("引脚查询已开启联网检索", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/_lib/pinout.js"), "utf8");
    assert.match(src, /callGemini\(sys, `查询 \$\{partNumber\} 的引脚定义`, 4096, true\)/);
  });
  await t.test("被拒时带结构化原因回前端", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/v2/ecad.js"), "utf8");
    assert.match(src, /out\.aiPinoutRejected = r\.rejected/);
    assert.match(SRC, /aiPinoutRejected\?\.message/);
  });
});

// ─────────────────────────────────────────────────────────────
test("库文件与资源链接走同源代理", async t => {
  await t.test("ezPLM 资源经代理，站外链接直连", () => {
    assert.match(SRC, /const resHref=/);
    for (const f of ["datasheetUrl", "footprintFileUrl", "model3dUrl", "symbolUrl"])
      assert.match(SRC, new RegExp(`href=\\{resHref\\(original\\.${f}\\)\\}`), `${f} 应走 resHref`);
    // 官网产品页是站外链接，必须保持直连
    assert.match(SRC, /href=\{original\.productUrl\}/);
  });

  await t.test("代理主机白名单改为 ezPLM 域后缀匹配", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/ezplm-resource.js"), "utf8");
    assert.match(src, /ALLOWED_SUFFIXES/);
    assert.doesNotMatch(src, /ALLOWED_HOSTS/);
  });

  await t.test("浏览器直接点开时返回可读页面而非裸 JSON", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/ezplm-resource.js"), "utf8");
    assert.match(src, /text\/html/);
    assert.match(src, /function fail\(req, res, status, error, hint\)/);
  });
});

// ─────────────────────────────────────────────────────────────
test("界面清理：版本号与应用领域", async t => {
  await t.test("页头页脚不再显示版本号", () => {
    assert.doesNotMatch(SRC, /v\{APP_VERSION\}/);
    // 仍保留不可见属性供部署核对
    assert.match(SRC, /data-app-version=\{APP_VERSION\}/);
  });
  await t.test("应用领域筛选已移除", () => {
    assert.doesNotMatch(SRC, /🎯 应用领域/);
    assert.doesNotMatch(SRC, /APPLICATIONS\.map/);
  });
  await t.test("后端仍接受 application 维度（供 ezPLM 走 API 调用）", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "api/v2/recommend.js"), "utf8");
    assert.match(src, /application = "generic"/);
  });
});

// ─────────────────────────────────────────────────────────────
test("3D 预览：WebGL 预检与上下文归还", async t => {
  await t.test("加载前先预检 WebGL", () => {
    assert.match(SRC, /function probeWebGL\(\)/);
    assert.match(SRC, /const probe=probeWebGL\(\)/);
  });
  await t.test("创建失败逐级降级", () => {
    assert.match(SRC, /function createRenderer\(THREE\)/);
    assert.match(SRC, /failIfMajorPerformanceCaveat:false/);
    assert.doesNotMatch(SRC, /new THREE\.WebGLRenderer\(\{antialias:true,alpha:true\}\)/);
  });
  await t.test("dispose 时归还 context，避免耗尽名额", () => {
    assert.match(SRC, /forceContextLoss\(\)/);
    assert.match(SRC, /webglcontextlost/);
  });
});

function mockRes() {
  return {
    _status: null, _body: null, _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
    send(b) { this._body = b; return this; },
  };
}

// ─────────────────────────────────────────────────────────────
// v6.9.3：vercel.json functions 模式（本次 Vercel 构建失败的直接原因）
test("vercel.json functions 模式合法", async t => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  const patterns = Object.keys(cfg.functions || {});

  await t.test("每个模式都能匹配到 api 下的函数文件，且互不重叠", () => {
    const apiDir = path.join(__dirname, "..", "api");
    const walk = d => fs.readdirSync(d).flatMap(f => {
      const p = path.join(d, f);
      return fs.statSync(p).isDirectory() ? walk(p) : (p.endsWith(".js") ? [p] : []);
    });
    const files = walk(apiDir).map(f => path.relative(path.join(__dirname, ".."), f).split(path.sep).join("/"));
    assert.ok(files.length > 0, "api 目录下应有函数文件");

    const owner = new Map();
    for (const pat of patterns) {
      const re = globToRe(pat);
      const matched = files.filter(f => re.test(f));
      assert.ok(matched.length > 0, `模式 "${pat}" 未匹配到任何函数文件 —— Vercel 会构建失败`);
      for (const f of matched) {
        assert.ok(!owner.has(f), `${f} 被 "${owner.get(f)}" 与 "${pat}" 同时匹配 —— Vercel 不允许模式重叠`);
        owner.set(f, pat);
      }
    }
  });

  await t.test("pdfjs 字体与 CMap 仍被打进函数包", () => {
    const inc = Object.values(cfg.functions || {}).map(v => v.includeFiles || "").join(" ");
    assert.match(inc, /pdfjs-dist/);
    assert.match(inc, /standard_fonts/);
    assert.match(inc, /cmaps/);
  });
});

function globToRe(g) {
  let out = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") { i++; out += "(?:[^/]+/)*"; } else out += ".*";
      } else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else if (c === "{") {
      const end = g.indexOf("}", i);
      if (end < 0) { out += "\\{"; continue; }
      out += "(?:" + g.slice(i + 1, end).split(",")
        .map(x => x.replace(/[.+^${}()|[\]\\*?]/g, "\\$&")).join("|") + ")";
      i = end;
    } else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + out + "$");
}
