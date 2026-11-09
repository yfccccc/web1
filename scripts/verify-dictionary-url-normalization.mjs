import fs from "node:fs";
import {
  SITE_ORIGIN,
  TARGET_TERMS,
  normalizeTermTitle,
  parseCliArgs,
  plainTextFromHtml,
} from "./dictionary-link-config.mjs";

const args = parseCliArgs();
const origin = String(args.origin || SITE_ORIGIN).replace(/\/$/, "");
const urlMap = JSON.parse(fs.readFileSync(String(args["url-map"] || "scripts/output/dictionary-url-map.json"), "utf8"));
const aliasMap = JSON.parse(fs.readFileSync(String(args.aliases || "scripts/output/dictionary-legacy-alias-map.json"), "utf8"));

async function request(url) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  return { response, body: response.status === 200 ? await response.text() : "" };
}

function canonical(html, pageUrl) {
  const tag = (html.match(/<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*>/i) || [])[0];
  const href = tag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  return href ? new URL(href, pageUrl).toString() : null;
}

function h1(html) {
  return plainTextFromHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
}

async function main() {
  const failures = [];
  for (const title of TARGET_TERMS) {
    const item = urlMap[title];
    const page = await request(item.url);
    if (page.response.status !== 200) failures.push(`${title}: canonical status ${page.response.status}`);
    if (canonical(page.body, item.url) !== item.url) failures.push(`${title}: canonical mismatch`);
    if (normalizeTermTitle(h1(page.body)) !== normalizeTermTitle(title)) failures.push(`${title}: H1 mismatch`);
  }

  for (const [aliasPath, targetPath] of Object.entries(aliasMap)) {
    const aliasUrl = new URL(aliasPath, origin).toString();
    const expected = new URL(targetPath, origin).toString();
    const alias = await request(aliasUrl);
    const location = alias.response.headers.get("location");
    const resolved = location ? new URL(location, aliasUrl).toString() : null;
    if (alias.response.status !== 301) failures.push(`${aliasPath}: expected 301, got ${alias.response.status}`);
    if (resolved !== expected) failures.push(`${aliasPath}: expected ${expected}, got ${resolved}`);
    const target = await request(expected);
    if (target.response.status !== 200 || target.response.headers.get("location")) failures.push(`${aliasPath}: redirect target is not direct 200`);
    if (aliasMap[targetPath]) failures.push(`${aliasPath}: redirect chain configured`);
  }

  const unknown = await request(`${origin}/dictionary/codex-verification-unknown-term-20260717`);
  if (unknown.response.status !== 404 || unknown.response.headers.get("location")) failures.push(`unknown URL: expected 404, got ${unknown.response.status}`);

  const sitemap = await request(`${origin}/sitemap.xml`);
  if (sitemap.response.status !== 200) failures.push(`sitemap status ${sitemap.response.status}`);
  const sitemapUrls = [...sitemap.body.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => match[1].trim());
  if (new Set(sitemapUrls).size !== sitemapUrls.length) failures.push("sitemap contains duplicate URLs");
  for (const title of TARGET_TERMS) if (!sitemapUrls.includes(urlMap[title].url)) failures.push(`${title}: missing from sitemap`);
  for (const aliasPath of Object.keys(aliasMap)) {
    const aliasUrl = new URL(aliasPath, origin).toString();
    if (sitemapUrls.includes(aliasUrl)) failures.push(`${aliasPath}: alias present in sitemap`);
  }
  if (sitemapUrls.some((url) => url.includes("/membership/") || url.includes("/api/") || url.includes("?") || url.includes("#"))) failures.push("sitemap contains excluded or parameterized URL");

  console.log(JSON.stringify({ officialCount: TARGET_TERMS.length, aliasCount: Object.keys(aliasMap).length, sitemapUrlCount: sitemapUrls.length, failureCount: failures.length, failures }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main();
