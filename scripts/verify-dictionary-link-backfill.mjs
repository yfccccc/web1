import fs from "node:fs";
import {
  LINK_PLANS,
  SITE_ORIGIN,
  parseCliArgs,
  plainTextFromHtml,
} from "./dictionary-link-config.mjs";

const args = parseCliArgs();
const origin = String(args.origin || SITE_ORIGIN).replace(/\/$/, "");
const urlMap = JSON.parse(fs.readFileSync(String(args["url-map"] || "scripts/output/dictionary-url-map.json"), "utf8"));
const placeholderPattern = /上线后回填|URL占位符|\{\{URL:/;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchDirect(url) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  return { response, body: response.status === 200 ? await response.text() : "" };
}

function extractCanonical(html, pageUrl) {
  const tag = (html.match(/<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*>/i) || [])[0];
  const href = tag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  return href ? new URL(href, pageUrl).toString() : null;
}

async function main() {
  const failures = [];
  const sourceTitles = [...new Set(LINK_PLANS.map((plan) => plan.source))];
  const targetUrls = new Set();
  let verifiedLinks = 0;

  for (const sourceTitle of sourceTitles) {
    const sourceUrl = urlMap[sourceTitle].url;
    const page = await fetchDirect(sourceUrl);
    if (page.response.status !== 200 || page.response.headers.get("location")) {
      failures.push(`${sourceTitle}: source is not direct 200`);
      continue;
    }
    if (extractCanonical(page.body, sourceUrl) !== sourceUrl) failures.push(`${sourceTitle}: canonical mismatch`);
    if (placeholderPattern.test(plainTextFromHtml(page.body))) failures.push(`${sourceTitle}: placeholder text remains`);
    const anchorTokens = page.body.match(/<a\b[^>]*>|<\/a>/gi) ?? [];
    let anchorDepth = 0;
    let nestedAnchorDetected = false;
    for (const token of anchorTokens) {
      if (/^<\/a/i.test(token)) anchorDepth = Math.max(0, anchorDepth - 1);
      else {
        anchorDepth += 1;
        if (anchorDepth > 1) nestedAnchorDetected = true;
      }
    }
    if (nestedAnchorDetected) failures.push(`${sourceTitle}: nested anchor detected`);

    for (const plan of LINK_PLANS.filter((item) => item.source === sourceTitle)) {
      const targetUrl = urlMap[plan.target].url;
      targetUrls.add(targetUrl);
      const anchorRegex = new RegExp(`<a\\b([^>]*)href=["']${escapeRegex(targetUrl)}["']([^>]*)>([\\s\\S]*?)<\\/a>`, "gi");
      const matches = [...page.body.matchAll(anchorRegex)].filter((match) => plainTextFromHtml(match[3]) === plan.target);
      if (matches.length !== 1) {
        failures.push(`${sourceTitle} -> ${plan.target}: expected one rendered link, found ${matches.length}`);
        continue;
      }
      const attributes = `${matches[0][1]} ${matches[0][2]}`;
      if (/\btarget\s*=\s*["']?_blank/i.test(attributes)) failures.push(`${sourceTitle} -> ${plan.target}: target=_blank remains`);
      if (/\brel\s*=\s*["'][^"']*(?:nofollow|sponsored)/i.test(attributes)) failures.push(`${sourceTitle} -> ${plan.target}: disallowed rel remains`);
      verifiedLinks += 1;
    }
  }

  for (const targetUrl of targetUrls) {
    const target = await fetchDirect(targetUrl);
    if (target.response.status !== 200 || target.response.headers.get("location")) failures.push(`${targetUrl}: link target is not direct 200`);
  }

  const sitemap = await fetchDirect(`${origin}/sitemap.xml`);
  if (sitemap.response.status !== 200) failures.push(`sitemap status ${sitemap.response.status}`);

  console.log(JSON.stringify({ sourcePageCount: sourceTitles.length, plannedLinkCount: LINK_PLANS.length, verifiedLinkCount: verifiedLinks, targetPageCount: targetUrls.size, failureCount: failures.length, failures }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main();
