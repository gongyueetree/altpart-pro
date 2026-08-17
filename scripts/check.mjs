/**
 * 静态检查：
 *  1. 所有后端 JS 语法
 *  2. 前端单文件 JSX 语法 + 未定义引用（曾因此白屏）
 * 不依赖任何密钥，可在 CI 中运行。
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

let fail = 0;
const walk = d => readdirSync(d).flatMap(f => {
  const p = path.join(d, f);
  return statSync(p).isDirectory() ? walk(p) : (p.endsWith(".js") ? [p] : []);
});

for (const f of walk("api")) {
  try { execSync(`node --check "${f}"`, { stdio: "pipe" }); }
  catch (e) { console.error(`✗ 语法错误: ${f}\n${e.stderr?.toString().slice(0, 300)}`); fail++; }
}
console.log(fail ? `后端语法：${fail} 个文件失败` : "✓ 后端语法全部通过");

// 前端：需要 acorn；缺失时跳过而不是误报通过
try {
  const acorn = await import("acorn");
  const jsx = (await import("acorn-jsx")).default;
  const escope = await import("eslint-scope");
  // 构建后 index.html 是产物；源文件在 index.src.html
  const srcPath = existsSync("public/index.src.html") ? "public/index.src.html" : "public/index.html";
  const html = readFileSync(srcPath, "utf8");
  const code = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)?.[1] || "";
  const ast = acorn.Parser.extend(jsx()).parse(code,
    { ecmaVersion: 2022, sourceType: "module", ranges: true, locations: true });
  const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: "module", ignoreEval: true,
    childVisitorKeys: { JSXElement: ["openingElement", "children", "closingElement"],
      JSXOpeningElement: ["name", "attributes"], JSXAttribute: ["name", "value"],
      JSXExpressionContainer: ["expression"], JSXFragment: ["children"], JSXSpreadAttribute: ["argument"] } });
  const GLOBALS = new Set(["window","document","console","fetch","setTimeout","clearTimeout","setInterval","clearInterval",
    "Math","JSON","Object","Array","String","Number","Boolean","Date","Promise","Map","Set","RegExp","Error","isFinite","isNaN",
    "parseInt","parseFloat","encodeURIComponent","decodeURIComponent","URL","URLSearchParams","Blob","FileReader",
    "AbortController","AbortSignal","ResizeObserver","performance","requestAnimationFrame","cancelAnimationFrame","devicePixelRatio","location","navigator",
    "alert","Intl","Uint8Array","Float32Array","TextDecoder","CSS","React","ReactDOM","module","exports","require",
    "globalThis","undefined","NaN","Infinity","Function","Symbol"]);
  const undef = new Map();
  for (const ref of sm.globalScope.through)
    if (!GLOBALS.has(ref.identifier.name) && !undef.has(ref.identifier.name))
      undef.set(ref.identifier.name, ref.identifier.loc.start.line);
  if (undef.size) {
    console.error("✗ 前端存在未定义引用（会导致运行时白屏）:");
    for (const [n, l] of undef) console.error(`   ${n} (行 ${l})`);
    fail++;
  } else console.log("✓ 前端 JSX 语法与引用检查通过");
} catch (e) {
  if (/Cannot find (package|module)/.test(String(e.message))) {
    console.warn("⚠ 缺少 acorn/acorn-jsx/eslint-scope，跳过前端检查（npm i -D acorn acorn-jsx eslint-scope）");
  } else { console.error("✗ 前端检查失败:", e.message); fail++; }
}

// ── vercel.json 的 functions 模式校验 ──
// Vercel 规则：每个 functions 键都必须匹配到至少一个 api 下的函数文件，
// 且**同一个文件不能被两个模式同时匹配**。违反任一条都是构建期硬失败：
//   Error: The pattern "api/v2/ecad.js" defined in `functions` doesn't match
//          any Serverless Functions inside the `api` directory.
// 这类错误只在 Vercel 构建时才暴露，本地测试全绿也照样上线失败，故在此提前拦截。
try {
  const cfg = JSON.parse(readFileSync("vercel.json", "utf8"));
  const patterns = Object.keys(cfg.functions || {});
  if (patterns.length) {
    const apiFiles = walk("api").map(f => f.split(path.sep).join("/"));
    // glob → 正则。先把通配符换成占位符再拼正则，
    // 否则后一步的 ? 替换会把前一步插入的 (?:...)? 语法打碎。
    const toRe = g => {
      let out = "";
      for (let i = 0; i < g.length; i++) {
        const c = g[i];
        if (c === "*") {
          if (g[i + 1] === "*") {
            i++;
            if (g[i + 1] === "/") { i++; out += "(?:[^/]+/)*"; }
            else out += ".*";
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
    };
    const owner = new Map();
    let bad = 0;
    for (const pat of patterns) {
      const re = toRe(pat);
      const matched = apiFiles.filter(f => re.test(f));
      if (!matched.length) {
        console.error(`✗ vercel.json functions 模式 "${pat}" 未匹配到任何 api 下的函数文件`);
        bad++;
        continue;
      }
      for (const f of matched) {
        if (owner.has(f)) {
          console.error(`✗ vercel.json 模式重叠：${f} 同时被 "${owner.get(f)}" 与 "${pat}" 匹配`);
          bad++;
        } else owner.set(f, pat);
      }
    }
    if (bad) fail++;
    else console.log(`✓ vercel.json functions 模式校验通过（${patterns.length} 个模式，覆盖 ${owner.size} 个函数）`);
  }
} catch (e) {
  console.error("✗ vercel.json 校验失败:", e.message); fail++;
}

process.exit(fail ? 1 : 0);
