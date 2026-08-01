/**
 * 把 occt-import-js 的 WASM 与 JS 复制到 public/vendor/。
 * 为什么不走 CDN：国内网络与 CSP/离线部署下 CDN 不可靠，必须由本站自发。
 * 约 7.6MB 不进版本库（.gitignore 已排除），由 npm run vendor 生成。
 * 用法：npm i occt-import-js && npm run vendor
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
let pkgDir;
try { pkgDir = path.dirname(require.resolve("occt-import-js")); }
catch { console.error("[vendor] 未安装 occt-import-js，先执行: npm i occt-import-js"); process.exit(1); }
const destDir = path.join(process.cwd(), "public", "vendor");
mkdirSync(destDir, { recursive: true });
let n = 0;
for (const f of ["occt-import-js.wasm", "occt-import-js.js"]) {
  const src = path.join(pkgDir, f);
  if (existsSync(src)) { copyFileSync(src, path.join(destDir, f)); console.log(`[vendor] ${f} 已就绪`); n++; }
  else console.warn(`[vendor] 缺少 ${f}`);
}
if (!n) { console.error("[vendor] 没有复制到任何文件"); process.exit(1); }
