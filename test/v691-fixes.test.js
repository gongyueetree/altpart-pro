// v6.9.1 回归测试：CORS 白名单 + PDF 字体/CMap 资源
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { resolveOrigin } = require("../api/_lib/_cors");
const req = origin => ({ headers: origin ? { origin } : {} });

test("CORS 允许来源白名单", async t => {
  const saved = process.env.ALLOWED_ORIGINS;
  t.after(() => {
    if (saved === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = saved;
  });

  await t.test("未配置时维持 * ，不改变既有行为", () => {
    delete process.env.ALLOWED_ORIGINS;
    assert.strictEqual(resolveOrigin(req("https://any.example")), "*");
  });

  await t.test("显式配置 * 仍为 *", () => {
    process.env.ALLOWED_ORIGINS = "*";
    assert.strictEqual(resolveOrigin(req("https://any.example")), "*");
  });

  await t.test("白名单命中时回显该 Origin", () => {
    process.env.ALLOWED_ORIGINS = "https://altpart.eetree.cn, https://www.ezplm.cn";
    assert.strictEqual(resolveOrigin(req("https://www.ezplm.cn")), "https://www.ezplm.cn");
  });

  await t.test("白名单未命中时不回显请求方 Origin", () => {
    process.env.ALLOWED_ORIGINS = "https://altpart.eetree.cn,https://www.ezplm.cn";
    const got = resolveOrigin(req("https://evil.example"));
    assert.notStrictEqual(got, "https://evil.example");
    assert.notStrictEqual(got, "*");
    assert.strictEqual(got, "https://altpart.eetree.cn");
  });

  await t.test("无 Origin 头（同源/服务端调用）不报错", () => {
    process.env.ALLOWED_ORIGINS = "https://altpart.eetree.cn";
    assert.strictEqual(resolveOrigin(req(null)), "https://altpart.eetree.cn");
  });
});

test("pdfjs 标准字体与 CMap 资源可解析", async t => {
  const root = path.dirname(require.resolve("pdfjs-dist/package.json"));

  await t.test("依赖版本已越过 GHSA-hq66-cqwq-w95j 影响范围", () => {
    const v = require("pdfjs-dist/package.json").version;
    const [maj, min, pat] = v.split(".").map(Number);
    const ok = maj > 6 || (maj === 6 && (min > 2 || (min === 2 && pat >= 108)));
    assert.ok(ok, `pdfjs-dist ${v} 仍在受影响范围（需 >= 6.2.108）`);
  });

  await t.test("standard_fonts 与 cmaps 目录存在", () => {
    assert.ok(fs.existsSync(path.join(root, "standard_fonts")), "缺少 standard_fonts");
    assert.ok(fs.existsSync(path.join(root, "cmaps")), "缺少 cmaps");
  });

  await t.test("解析标准字体 PDF 不再退化，文本可抽出", async () => {
    const { parsePdf } = require("../api/_lib/pdf-pins");
    const doc = await parsePdf(makeMinimalPdf());
    assert.strictEqual(doc.numPages, 1);
    assert.match(doc.pages[0].text, /Pin Functions/);
    assert.match(doc.pages[0].text, /1 VCC Power supply/);
  });

  await t.test("vercel.json 已把字体资源打进 ecad 函数", () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
    const inc = cfg.functions?.["api/v2/ecad.js"]?.includeFiles || "";
    assert.match(inc, /pdfjs-dist/);
    assert.match(inc, /standard_fonts/);
    assert.match(inc, /cmaps/);
  });
});

/** 手工构造一份使用 Type1 标准字体（Helvetica）的最小 PDF */
function makeMinimalPdf() {
  const content =
    "BT /F1 12 Tf 72 720 Td (Pin Functions) Tj 0 -20 Td (1 VCC Power supply) Tj " +
    "0 -20 Td (2 GND Ground) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
