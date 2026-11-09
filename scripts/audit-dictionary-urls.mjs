import {
  SITE_ORIGIN,
  TARGET_TERMS,
  canonicalDictionaryUrl,
  createPrismaClient,
  decodeHtmlEntities,
  normalizeTermTitle,
  parseCliArgs,
  plainTextFromHtml,
  writeJson,
} from "./dictionary-link-config.mjs";

const args = parseCliArgs();
const origin = String(args.origin || SITE_ORIGIN).replace(/\/$/, "");
const outputPath = String(args.output || "scripts/output/dictionary-url-map.json");
const anomalyPath = String(args.anomalies || "scripts/output/dictionary-url-anomalies.json");
const aliasOutputPath = String(args["alias-output"] || "scripts/output/dictionary-legacy-alias-map.json");
const prisma = createPrismaClient();

function dictionaryWhere() {
  return {
    OR: [
      { categoryHref: { startsWith: "/dictionary" } },
      { subHref: { startsWith: "/dictionary" } },
    ],
  };
}

async function fetchManual(url) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "cnzhengmu-dictionary-audit/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    return {
      status: response.status,
      location: response.headers.get("location"),
      body: response.status === 200 ? await response.text() : "",
      error: null,
    };
  } catch (error) {
    return { status: 0, location: null, body: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function extractCanonical(html, pageUrl) {
  for (const tag of String(html).match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel\s*=\s*(?:["'][^"']*canonical[^"']*["']|canonical\b)/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (!href) continue;
    try {
      return new URL(href[1] || href[2] || href[3], pageUrl).toString();
    } catch {
      return href[1] || href[2] || href[3] || null;
    }
  }
  return null;
}

function extractH1(html) {
  const match = String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? plainTextFromHtml(match[1]) : null;
}

function extractSitemapUrls(xml) {
  return new Set(
    [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeHtmlEntities(match[1].trim())),
  );
}

async function main() {
  const [articles, terms, sitemapResponse] = await Promise.all([
    prisma.article.findMany({
      where: dictionaryWhere(),
      select: { id: true, title: true, slug: true, status: true, categoryHref: true, subHref: true },
    }),
    prisma.term.findMany({ select: { id: true, title: true, slug: true } }),
    fetchManual(`${origin}/sitemap.xml`),
  ]);
  const sitemapUrls = sitemapResponse.status === 200 ? extractSitemapUrls(sitemapResponse.body) : new Set();
  const urlMap = {};
  const anomalies = [];
  const legacyAliasMap = {};

  for (const normalizedTitle of TARGET_TERMS) {
    const key = normalizeTermTitle(normalizedTitle);
    const articleMatches = articles.filter((row) => normalizeTermTitle(row.title) === key);
    const termMatches = terms.filter((row) => normalizeTermTitle(row.title) === key);
    const approvedMatches = articleMatches.filter((row) => row.status === "approved");

    if (approvedMatches.length !== 1 || termMatches.length > 0 || articleMatches.length !== 1) {
      anomalies.push({
        type: "record_match_anomaly",
        normalizedTitle,
        articleMatches: articleMatches.map(({ id, title, slug, status }) => ({ id, title, slug, status })),
        termMatches,
      });
      continue;
    }

    const record = approvedMatches[0];
    const url = canonicalDictionaryUrl(record.slug, origin);
    const page = await fetchManual(url);
    const canonical = page.status === 200 ? extractCanonical(page.body, url) : null;
    const h1 = page.status === 200 ? extractH1(page.body) : null;
    const canonicalPage = canonical ? await fetchManual(canonical) : { status: 0, location: null, error: "missing canonical" };
    const aliasCandidates = [...new Set([record.title, normalizedTitle])]
      .map((segment) => canonicalDictionaryUrl(segment, origin))
      .filter((candidate) => candidate !== url);
    const duplicate200Urls = [];
    const legacyAliasRedirects = [];
    for (const candidate of aliasCandidates) {
      const aliasPage = await fetchManual(candidate);
      if (aliasPage.status === 200) {
        const duplicate = {
          url: candidate,
          canonical: extractCanonical(aliasPage.body, candidate),
          h1: extractH1(aliasPage.body),
        };
        duplicate200Urls.push(duplicate);
        if (duplicate.canonical === url && normalizeTermTitle(duplicate.h1) === key) {
          legacyAliasMap[decodeURIComponent(new URL(candidate).pathname)] = new URL(url).pathname;
        }
      } else if (aliasPage.status >= 300 && aliasPage.status < 400 && aliasPage.location) {
        const resolvedLocation = new URL(aliasPage.location, candidate).toString();
        const redirectTarget = await fetchManual(resolvedLocation);
        const redirect = {
          url: candidate,
          status: aliasPage.status,
          location: resolvedLocation,
          targetStatus: redirectTarget.status,
          targetLocation: redirectTarget.location,
        };
        legacyAliasRedirects.push(redirect);
        if (aliasPage.status === 301 && resolvedLocation === url && redirectTarget.status === 200 && !redirectTarget.location) {
          legacyAliasMap[decodeURIComponent(new URL(candidate).pathname)] = new URL(url).pathname;
        } else {
          anomalies.push({ type: "legacy_alias_redirect_invalid", normalizedTitle, ...redirect });
        }
      } else {
        anomalies.push({ type: "expected_legacy_alias_missing", normalizedTitle, url: candidate, status: aliasPage.status, error: aliasPage.error });
      }
    }

    const entry = {
      contentId: record.id,
      adminTitle: record.title,
      normalizedTitle,
      publishedStatus: record.status,
      slug: record.slug,
      url,
      status: page.status,
      redirectLocation: page.location,
      canonical,
      canonicalStatus: canonicalPage.status,
      canonicalRedirectLocation: canonicalPage.location,
      h1,
      h1MatchesTarget: normalizeTermTitle(h1) === key,
      duplicate200Urls,
      legacyAliasRedirects,
      sitemapIncluded: sitemapUrls.has(url),
    };
    urlMap[normalizedTitle] = entry;

    if (page.status !== 200 || page.location) anomalies.push({ type: "public_url_not_direct_200", normalizedTitle, url, status: page.status, location: page.location, error: page.error });
    if (canonical !== url) anomalies.push({ type: "canonical_mismatch", normalizedTitle, url, canonical });
    if (canonicalPage.status !== 200 || canonicalPage.location) anomalies.push({ type: "canonical_not_direct_200", normalizedTitle, canonical, status: canonicalPage.status, location: canonicalPage.location, error: canonicalPage.error });
    if (!entry.h1MatchesTarget) anomalies.push({ type: "h1_mismatch", normalizedTitle, h1, adminTitle: record.title });
    if (duplicate200Urls.length > 0) anomalies.push({ type: "duplicate_200_urls", normalizedTitle, canonicalUrl: url, duplicates: duplicate200Urls });
    if (!entry.sitemapIncluded) anomalies.push({ type: "sitemap_missing", normalizedTitle, url });
  }

  const slugGroups = new Map();
  for (const row of articles) {
    const slug = String(row.slug).trim();
    slugGroups.set(slug, [...(slugGroups.get(slug) ?? []), { id: row.id, title: row.title, status: row.status }]);
  }
  for (const [slug, records] of slugGroups) {
    if (records.length > 1) anomalies.push({ type: "slug_collision", slug, records });
  }
  if (sitemapResponse.status !== 200 || sitemapResponse.location) {
    anomalies.push({ type: "sitemap_unavailable", status: sitemapResponse.status, location: sitemapResponse.location, error: sitemapResponse.error });
  }

  const unknownUrl = `${origin}/dictionary/codex-audit-unknown-term-20260717`;
  const unknownPage = await fetchManual(unknownUrl);
  if (unknownPage.status !== 404 || unknownPage.location) {
    anomalies.push({ type: "unknown_dictionary_url_not_404", url: unknownUrl, status: unknownPage.status, location: unknownPage.location });
  }

  for (const [alias, target] of Object.entries(legacyAliasMap)) {
    if (legacyAliasMap[target]) anomalies.push({ type: "legacy_alias_chain", alias, target, nextTarget: legacyAliasMap[target] });
    if (alias === target) anomalies.push({ type: "legacy_alias_loop", alias, target });
  }

  const mapFile = writeJson(outputPath, urlMap);
  const aliasFile = writeJson(aliasOutputPath, Object.fromEntries(Object.entries(legacyAliasMap).sort(([left], [right]) => left.localeCompare(right, "zh-CN"))));
  const anomalyFile = writeJson(anomalyPath, {
    generatedAt: new Date().toISOString(),
    origin,
    targetCount: TARGET_TERMS.length,
    mappedCount: Object.keys(urlMap).length,
    sitemapStatus: sitemapResponse.status,
    anomalyCount: anomalies.length,
    anomalies,
  });
  console.log(JSON.stringify({ mapFile, anomalyFile, aliasFile, mappedCount: Object.keys(urlMap).length, aliasCount: Object.keys(legacyAliasMap).length, anomalyCount: anomalies.length }, null, 2));
  if (anomalies.length > 0) process.exitCode = 2;
}

main().finally(() => prisma.$disconnect());
