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

// 产物自检：Babel 会把非 ASCII 转成 \uXXXX（大写十六进制），
// 直接 grep 中文会误判为"内容缺失"。这里用同样的转义规则做真实校验。
const escUp = t => [...t].map(c => c.charCodeAt(0) > 127
  ? "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase() : c).join("");
const inBundle = t => code.includes(t) || code.includes(escUp(t))
  || code.includes(escUp(t).toLowerCase());

// 从源码里抽取若干 JSX 文本作为抽样锚点，确认产物完整
const anchors = (m[1].match(/>[^<>{}\n]*[\u4e00-\u9fa5]{4,}[^<>{}\n]*</g) || [])
  .map(x => (x.match(/[\u4e00-\u9fa5]{4,}/) || [])[0]).filter(Boolean);
const sample = [...new Set(anchors)].slice(0, 12);
const missing = sample.filter(t => !inBundle(t));
if (missing.length) {
  console.error(`[build] ✗ 产物缺失 ${missing.length}/${sample.length} 处界面文案，构建可能不完整:`);
  missing.slice(0, 5).forEach(t => console.error(`         ${t}`));
  process.exit(1);
}
console.log(`[build] ✓ 产物自检通过（抽样 ${sample.length} 处界面文案均存在）`);

console.log(`[build] ✓ public/dist/${bundleName}  (${(code.length / 1024).toFixed(1)} KB)`);
console.log(`[build] ✓ public/index.html 已改为加载预编译脚本，不再运行浏览器端 Babel`);
