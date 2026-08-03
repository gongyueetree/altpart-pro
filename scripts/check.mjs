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
    "AbortController","AbortSignal","requestAnimationFrame","cancelAnimationFrame","devicePixelRatio","location","navigator",
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
process.exit(fail ? 1 : 0);
