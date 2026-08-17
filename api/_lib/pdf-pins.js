// pdf-pins.js — 从 PDF 数据手册提取引脚定义
//
// 架构（借鉴 datasheet-cad 的"程序优先"纪律）：
//   1. pdfjs 提取每页文字与坐标，按 y 聚合成行
//   2. 定位 Pin/Terminal Functions 章节
//   3. 正则规则解析表格行 → 引脚号/名称/类型/描述
//   4. 只有在程序提取不足时，才把**相关页文本**（非整份 PDF）交给 LLM 校验
// 目的：几何与结构由确定性程序负责，LLM 只补语义，避免整份 PDF 交给模型产生幻觉。

const { cache } = require("./cache");
const TTL = 30 * 86400;
const MAX_PDF_BYTES = 18 * 1024 * 1024;

const norm = v => String(v || "").replace(/\u00a0/g, " ").replace(/[\t\r]+/g, " ").replace(/\s+/g, " ").trim();
const lineKey = (y, tol = 2.5) => Math.round(Number(y || 0) / tol) * tol;

let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

// 标准字体与 CMap 资源目录。
// 不提供时 pdfjs 会告警并对 Type1 标准字体（Helvetica/Times…）退化，
// 中文数据手册的 CJK 编码更会直接抽不出字。路径不存在则不传，避免打包环境下报错。
let pdfAssets = null;
function getPdfAssets() {
  if (pdfAssets) return pdfAssets;
  pdfAssets = {};
  try {
    const path = require("path");
    const { existsSync } = require("fs");
    const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
    const fonts = path.join(root, "standard_fonts") + path.sep;
    const cmaps = path.join(root, "cmaps") + path.sep;
    if (existsSync(fonts)) pdfAssets.standardFontDataUrl = fonts;
    if (existsSync(cmaps)) { pdfAssets.cMapUrl = cmaps; pdfAssets.cMapPacked = true; }
  } catch { /* 资源缺失时按无资源模式运行 */ }
  return pdfAssets;
}

/** 下载 PDF（限制大小与协议，避免 SSRF 与超大文件） */
async function fetchPdf(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error("PDF 地址不合法"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("仅支持 http/https");
  const r = await fetch(u.toString(), { redirect: "follow", signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`下载 PDF 失败 (HTTP ${r.status})`);
  const len = Number(r.headers.get("content-length") || 0);
  if (len && len > MAX_PDF_BYTES) throw new Error(`PDF 超过 ${MAX_PDF_BYTES / 1048576}MB 限制`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.byteLength > MAX_PDF_BYTES) throw new Error("PDF 过大");
  if (String.fromCharCode(...buf.slice(0, 4)) !== "%PDF") throw new Error("返回内容不是 PDF");
  return buf;
}

/** 解析 PDF → 页/行/坐标 */
async function parsePdf(bytes, maxPages = 12) {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({
    data: bytes, disableWorker: true, isEvalSupported: false, ...getPdfAssets(),
  }).promise;
  const pages = [];
  const n = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items
      .map(it => ({ text: norm(it.str), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0) }))
      .filter(it => it.text);
    const map = new Map();
    for (const it of items) {
      const k = lineKey(it.y);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    const lines = [...map.entries()].sort((a, b) => b[0] - a[0]).map(([y, arr]) => {
      const s = arr.sort((a, b) => a.x - b.x);
      return { y, text: norm(s.map(x => x.text).join(" ")) };
    });
    pages.push({ number: i, lines, text: lines.map(l => l.text).join("\n") });
  }
  return { pages, numPages: pdf.numPages };
}

/** 定位引脚定义章节 */
function findPinPages(doc) {
  const pat = /(pin|terminal)\s+(function|description|configuration|assignment)s?|引脚(功能|定义|说明)|管脚(功能|定义)/i;
  const hits = doc.pages.filter(p => pat.test(p.text)).map(p => p.number);
  return hits.length ? hits.slice(0, 4) : doc.pages.slice(0, 6).map(p => p.number);
}

function classifyType(raw, name) {
  const t = `${raw || ""} ${name || ""}`.toUpperCase();
  if (/N\.?C\.?\b|NO CONNECT/.test(t)) return "no_connect";
  if (/POWER|SUPPLY|VCC|VDD|VSS|VEE|GND|V\+|V−|V-/.test(t)) return "power";
  if (/I\/O|BIDIR/.test(t)) return "bidirectional";
  if (/OUTPUT|\bOUT\b|\bO\b/.test(t)) return "output";
  if (/INPUT|\bIN\b|\bI\b/.test(t)) return "input";
  return "passive";
}

/** 从行文本解析引脚表 */
function parsePinLines(page) {
  const out = [];
  for (const line of page.lines) {
    const t = line.text;
    if (t.length < 6 || t.length > 220) continue;
    // 形态1: 号 名 类型 描述    形态2: 号 名 描述
    let m = t.match(/^(\d{1,3}|EP|[A-Z]\d{1,2})\s+([A-Z0-9_+\-/.]{1,16})\s+([A-Z/−-]{1,10})\s+(.{4,})$/i)
         || t.match(/^(\d{1,3}|EP)\s+([A-Z0-9_+\-/.]{1,16})\s+(.{6,})$/i);
    if (!m) continue;
    const number = m[1], name = m[2];
    if (/^(PIN|NO|NUMBER|引脚|序号)$/i.test(number) || /^(NAME|TYPE|名称)$/i.test(name)) continue;
    const rawType = m.length === 5 ? m[3] : "";
    const desc = m.length === 5 ? m[4] : m[3];
    out.push({ number: String(number), name, type: classifyType(rawType, name), description: norm(desc).slice(0, 120) });
  }
  return out;
}

/**
 * 解析"引脚配置图"文字（ADI/TI 常见版式）
 * 例：AD8331 图 3 的文字层为  "LMD 1 20 COMM"  "INH 2 19 ENBL" …
 * 左名 左号 右号 右名，一行同时给出两个引脚。
 */
function parsePinConfigFigure(page) {
  const out = [];
  for (const line of page.lines) {
    const t = line.text;
    if (t.length > 80) continue;
    // 左名 左号 右号 右名
    let m = t.match(/^([A-Z][A-Z0-9_+\-/.]{1,9})\s+(\d{1,3})\s+(\d{1,3})\s+([A-Z][A-Z0-9_+\-/.]{1,9})$/);
    if (m) {
      const [, ln, lnum, rnum, rn] = m;
      out.push({ number: lnum, name: ln, type: classifyType("", ln), description: "" });
      out.push({ number: rnum, name: rn, type: classifyType("", rn), description: "" });
      continue;
    }
    // 单侧：名 号  或  号 名
    m = t.match(/^([A-Z][A-Z0-9_+\-/.]{1,9})\s+(\d{1,3})$/) || t.match(/^(\d{1,3})\s+([A-Z][A-Z0-9_+\-/.]{1,9})$/);
    if (m) {
      const isNumFirst = /^\d/.test(m[1]);
      const number = isNumFirst ? m[1] : m[2], name = isNumFirst ? m[2] : m[1];
      if (/^(FIGURE|TABLE|PAGE|REV|VIEW|TOP)$/i.test(name)) continue;
      out.push({ number, name, type: classifyType("", name), description: "" });
    }
  }
  // 编号需连续覆盖 1..N 的多数，否则多半是误匹配的散字
  const nums = [...new Set(out.map(p => Number(p.number)).filter(Number.isFinite))];
  if (nums.length < 4) return [];
  const max = Math.max(...nums);
  if (max > 256 || nums.length < max * 0.6) return [];
  return out;
}

function dedupe(pins) {
  const map = new Map();
  for (const p of pins) {
    const k = `${p.number}|${p.name}`;
    if (!map.has(k) || (p.description || "").length > (map.get(k).description || "").length) map.set(k, p);
  }
  return [...map.values()].sort((a, b) => {
    const na = Number(a.number), nb = Number(b.number);
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : String(a.number).localeCompare(String(b.number));
  });
}

/**
 * 主入口：从 datasheet PDF 提取引脚定义
 * @returns { pins, pageNumbers, method, warning }
 */
async function extractPinsFromPdf(pdfUrl, expectedPins) {
  const ck = `pdfpins:${pdfUrl}`;
  const hit = cache.get(ck);
  if (hit !== null && hit !== undefined) return hit || null;

  const bytes = await fetchPdf(pdfUrl);
  const doc = await parsePdf(bytes);
  const pageNumbers = findPinPages(doc);
  const fromTable = pageNumbers.flatMap(n => parsePinLines(doc.pages[n - 1]));
  const fromFigure = pageNumbers.flatMap(n => parsePinConfigFigure(doc.pages[n - 1]));
  // 表格含描述信息，优先；配置图补齐表格漏掉的引脚
  const byNum = new Map(fromTable.map(p => [String(p.number), p]));
  for (const p of fromFigure) if (!byNum.has(String(p.number))) byNum.set(String(p.number), p);
  const pins = dedupe([...byNum.values()]);

  let warning = "";
  if (!pins.length) { cache.set(ck, false, 3600); return null; }
  // PDF 表格解析同样可能把未识别行归成 NC，占比过高时不可信
  const ncCount = pins.filter(p => /^n\.?c\.?$|^nc\d*$|no[_ ]?connect/i.test(p.name)).length;
  if (ncCount / pins.length > 0.5) { cache.set(ck, false, 3600); return null; }
  if (ncCount > 0) warning = `含 ${ncCount} 个 NC 引脚，请与 datasheet 核对`;
  if (expectedPins && pins.length !== expectedPins) {
    warning = `提取到 ${pins.length} 个引脚，与封装标称 ${expectedPins} 个不一致，请人工核对`;
  }
  const result = {
    pins, pageNumbers, method: "program_pdf_text",
    warning,
    note: "由 PDF 文本坐标与表格规则程序化提取，未经人工确认",
  };
  cache.set(ck, result, TTL);
  return result;
}

module.exports = { extractPinsFromPdf, parsePdf, parsePinLines, parsePinConfigFigure, findPinPages };
