import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export const SITE_ORIGIN = "https://cnzhengmu.com";

export const TARGET_TERMS = [
  "木作深化图",
  "木作拆单",
  "木作BOM清单",
  "木作节点图",
  "木作收口",
  "木材含水率",
  "木作色差",
  "木作预装",
  "实木复合门",
  "隐形门",
  "衣帽间系统",
  "高定书房",
  "高定茶室",
  "大平层木作",
];

export const LINK_PLANS = [
  { source: "木作深化图", target: "木作节点图", forced: true },
  { source: "木作深化图", target: "木作拆单", forced: true },
  { source: "木作拆单", target: "木作BOM清单", forced: true },
  { source: "木作节点图", target: "隐形门", forced: true },
  { source: "木作节点图", target: "木作收口", forced: true },
  { source: "木作收口", target: "隐形门", forced: true },
  { source: "木材含水率", target: "实木复合门", forced: true },
  { source: "木材含水率", target: "木作色差", forced: true },
  { source: "实木复合门", target: "隐形门", forced: true },
  { source: "木作预装", target: "隐形门", forced: false },
  { source: "木作预装", target: "木作节点图", forced: false },
  { source: "木作预装", target: "木作拆单", forced: false },
  { source: "高定茶室", target: "高定书房", forced: false },
  { source: "高定茶室", target: "木作收口", forced: false },
  { source: "大平层木作", target: "衣帽间系统", forced: false },
  { source: "大平层木作", target: "木作深化图", forced: false },
  { source: "高定书房", target: "木作深化图", forced: false },
];

export function normalizeTermTitle(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^什么是\s*/, "")
    .replace(/\s+/g, "")
    .replace(/bom/gi, "BOM")
    .toUpperCase();
}

export function canonicalDictionaryUrl(slug, origin = SITE_ORIGIN) {
  return `${origin}/dictionary/${encodeURIComponent(String(slug).trim())}`;
}

export function isDictionaryArticle(row) {
  return String(row.categoryHref ?? "").startsWith("/dictionary") || String(row.subHref ?? "").startsWith("/dictionary");
}

export function loadEnvFile(filePath = path.resolve(".env")) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

export function createPrismaClient() {
  loadEnvFile();
  const requireFromProject = createRequire(path.resolve("package.json"));
  const { PrismaClient } = requireFromProject("@prisma/client");
  return new PrismaClient();
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

export function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function plainTextFromHtml(html) {
  return decodeHtmlEntities(String(html ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
