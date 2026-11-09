import { prisma } from "../lib/prisma";
import { INDUSTRY_WHITELIST_SEED, NEWS_DISABLED_KEYWORDS } from "../lib/news-keyword-config-v2";
import { cleanStoredKeywordField } from "../lib/news-keyword-history";
import { keywordIdentity } from "../lib/news-keyword-rules";

// Default is SELECT-only. Apply requires an explicit, hash-verified reviewed plan; no extraction or learning.
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  if (args.some((arg) => arg !== "--apply" && !/^--limit=[1-9]\d*$/.test(arg) && !arg.startsWith("--plan=") && !/^--plan-sha256=[a-f0-9]{64}$/.test(arg))) {
    throw new Error("Usage: clean-news-keywords.ts [--limit=100] OR --apply --plan=/absolute/preview-report.json --plan-sha256=HEX");
  }
  const planPath = args.find((arg) => arg.startsWith("--plan="))?.slice(7);
  const planHash = args.find((arg) => arg.startsWith("--plan-sha256="))?.slice(14);
  if (apply) {
    if (!planPath || !planHash || args.some((arg) => arg.startsWith("--limit="))) throw new Error("Apply requires a reviewed plan and SHA-256; --limit is forbidden.");
    const { applyReviewedKeywordPlan } = await import("../lib/news-keyword-history-apply");
    console.log(JSON.stringify(await applyReviewedKeywordPlan(prisma, planPath, planHash)));
    return;
  }
  if (planPath || planHash) throw new Error("Plan arguments require --apply");
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice(8)) : Number.POSITIVE_INFINITY;
  const whitelist = await prisma.industryWhitelist.findMany({
    select: { word: true, synonyms: true, status: true, category: true }, orderBy: { word: "asc" },
  });
  const trusted = new Map(INDUSTRY_WHITELIST_SEED.map((entry) => [keywordIdentity(entry.word), [entry.word, ...(entry.synonyms ?? [])]]));
  for (const row of whitelist) {
    if (!row.status || NEWS_DISABLED_KEYWORDS.includes(row.word)) { trusted.delete(keywordIdentity(row.word)); continue; }
    let synonyms: string[] = [];
    try { const parsed: unknown = JSON.parse(row.synonyms || "[]"); if (Array.isArray(parsed)) synonyms = parsed.filter((word): word is string => typeof word === "string"); } catch { /* malformed synonyms confer no protection */ }
    trusted.set(keywordIdentity(row.word), [row.word, ...synonyms]);
  }
  const protectedWords = new Set(Array.from(trusted.values()).flat().filter((word) => !NEWS_DISABLED_KEYWORDS.includes(word)).map(keywordIdentity));
  const candidateArticles = new Map<string, Set<string>>();
  let cursor: string | undefined;
  let processed = 0, changedArticles = 0, changedFieldArticles = 0, changedFields = 0;
  let scannedTagRows = 0, changedTagRows = 0, reviewArticles = 0, reviewTags = 0;
  while (processed < limit) {
    const rows = await prisma.article.findMany({
      where: { categoryHref: "/news" }, orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: Math.min(100, limit - processed),
      select: { id: true, title: true, keywords: true, manualKeywords: true,
        keywordItems: { select: { id: true, keyword: true, isManual: true }, orderBy: { id: "asc" } } },
    });
    if (!rows.length) break;
    for (const article of rows) {
      const fields = { keywords: cleanStoredKeywordField(article.keywords, protectedWords),
        manualKeywords: cleanStoredKeywordField(article.manualKeywords, protectedWords) };
      const tags = article.keywordItems.map((row) => ({ id: row.id, isManual: row.isManual,
        ...cleanStoredKeywordField(row.keyword, protectedWords) }));
      scannedTagRows += tags.length;
      const fieldChanges = Object.values(fields).filter((field) => field.changed).length;
      const tagChanges = tags.filter((tag) => tag.changed);
      const review = [...Object.values(fields), ...tags].flatMap((field) => field.review);
      const changed = fieldChanges > 0 || tagChanges.length > 0;
      if (fieldChanges) changedFieldArticles++;
      changedFields += fieldChanges; changedTagRows += tagChanges.length;
      if (changed) changedArticles++;
      if (review.length) { reviewArticles++; reviewTags += review.length; }
      for (const change of [...Object.values(fields), ...tags].flatMap((field) => field.changes)) {
        if (!protectedWords.has(keywordIdentity(change.after))) {
          const ids = candidateArticles.get(change.after) ?? new Set<string>(); ids.add(article.id);
          candidateArticles.set(change.after, ids);
        }
      }
      if (changed || review.length) console.log(JSON.stringify({ type: "article", id: article.id, title: article.title,
        changed, fields, tagChanges, review }));
    }
    processed += rows.length; cursor = rows[rows.length - 1].id;
  }
  console.log(JSON.stringify({ type: "summary", mode: "preview", strategy: "stored-strings-only", processed,
    changedArticles, changedFieldArticles, changedFields, scannedTagRows, changedTagRows, reviewArticles, reviewTags,
    erasedTags: 0, extractedArticles: 0, promotions: 0, pendingWrites: 0,
    pendingCandidates: Array.from(candidateArticles, ([word, ids]) => ({ word, distinctArticles: ids.size }))
      .sort((a, b) => b.distinctArticles - a.distinctArticles || a.word.localeCompare(b.word)),
    whitelistReview: whitelist.filter((row) => NEWS_DISABLED_KEYWORDS.includes(row.word)),
  }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
