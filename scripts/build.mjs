/**
 * 构建：把内联 JSX 预编译为纯 JS，生产环境不再加载 babel-standalone。
 * （ALT-012：线上控制台警告 "You are using the in-browser Babel transformer"）
 *
 * 做法刻意保持最小：
 *  · 不引入打包器，不改变现有单文件开发方式
 *  · 从 index.html 抽出 <script type="text/babel">，用 @babel/core 转译
 *  · 产物写入 public/dist/app.<hash>.js，index.html 改为普通 <script src>
 *  · 开发时仍可直接用原始 index.html（保留 index.src.html）
 *
 * 用法：npm run build
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "index.src.html");
const OUT_HTML = path.join(ROOT, "public", "index.html");
const DIST = path.join(ROOT, "public", "dist");

// 首次构建：把当前 index.html 保存为源文件
if (!existsSync(SRC)) {
  writeFileSync(SRC, readFileSync(OUT_HTML, "utf8"));
  console.log("[build] 已保存源文件 public/index.src.html");
}

const html = readFileSync(SRC, "utf8");
const m = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!m) { console.error("[build] 未找到 <script type=\"text/babel\"> 块"); process.exit(1); }

let babel;
try { babel = await import("@babel/core"); }
catch {
  console.error("[build] 缺少 @babel/core，请先执行: npm i -D @babel/core @babel/preset-react");
  process.exit(1);
}

const { code } = await babel.transformAsync(m[1], {
  presets: [["@babel/preset-react", { runtime: "classic" }]],
  filename: "app.jsx",
  compact: false,
  sourceType: "script",
  babelrc: false, configFile: false,
});

const hash = createHash("sha256").update(code).digest("hex").slice(0, 10);
mkdirSync(DIST, { recursive: true });
// 清理旧产物
for (const f of readdirSync(DIST)) if (/^app\.[0-9a-f]+\.js$/.test(f)) unlinkSync(path.join(DIST, f));
const bundleName = `app.${hash}.js`;
writeFileSync(path.join(DIST, bundleName), code);

// 生成生产 HTML：移除 babel-standalone，改为普通脚本
let out = html
  .replace(/\s*<script[^>]*babel(?:-standalone)?[^>]*><\/script>/g, "")
  .replace(/<script type="text\/babel">[\s\S]*?<\/script>/,
           `<script src="./dist/${bundleName}"></script>`);

if (/babel/i.test(out)) console.warn("[build] ⚠ 产物中仍存在 babel 引用，请检查");
writeFileSync(OUT_HTML, out);

console.log(`[build] ✓ public/dist/${bundleName}  (${(code.length / 1024).toFixed(1)} KB)`);
console.log(`[build] ✓ public/index.html 已改为加载预编译脚本，不再运行浏览器端 Babel`);
