import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { cleanEntityName } from "../lib/news-keyword-rules";
import { buildPublishedNewsWhere } from "../lib/news-listing";

// This targeted preview deliberately has no write path. Apply requires separate review.
if (process.argv.length > 2) throw new Error("Preview only: no --apply or other arguments accepted before review.");
if (process.cwd() !== "/home/web1") throw new Error("Run from /home/web1 using its production .env.");
const match = fs.readFileSync("/home/web1/.env", "utf8").match(/^DATABASE_URL\s*=\s*(.*)$/m);
if (!match) throw new Error("Missing production DATABASE_URL");
process.env.DATABASE_URL = match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
const db = new PrismaClient();
const prefixes = ["兼", "期内", "今年", "去年", "同期", "截至"];
function preview(value: string | null) {
  const changes: { before: string; after: string }[] = [], review: string[] = [];
  const after = value?.replace(/[^,，、；;\r\n]+/g, (part) => {
    const word = part.trim();
    if (!prefixes.some(prefix => word.startsWith(prefix))) return part;
    const cleaned = cleanEntityName(word);
    if (!cleaned || cleaned === word || ["集团", "国际"].includes(cleaned) || word.startsWith("兼具")) {
      review.push(word); return part;
    }
    changes.push({ before: word, after: cleaned });
    return part.replace(word, cleaned);
  }) ?? null;
  return { before: value, after, changes, review };
}
db.$transaction(async tx => {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  const beforeCounts = { articles: await tx.article.count(), tags: await tx.newsKeyword.count() };
  const rows = await tx.article.findMany({where: buildPublishedNewsWhere(), orderBy: { id: "asc" },
    select: {id: true, title: true, slug: true, keywords: true, manualKeywords: true,
      keywordItems: {select: {id: true, keyword: true, isManual: true}}}});
  let changedArticles = 0, changedFields = 0, changedTags = 0;
  for (const row of rows) {
    const keywords = preview(row.keywords), manualKeywords = preview(row.manualKeywords);
    const tags = row.keywordItems.map(tag => ({id: tag.id, isManual: tag.isManual, ...preview(tag.keyword)}));
    const fieldChanges = [keywords, manualKeywords].filter(field => field.changes.length).length;
    const tagChanges = tags.filter(tag => tag.changes.length);
    if (fieldChanges || tagChanges.length) {
      changedArticles++; changedFields += fieldChanges; changedTags += tagChanges.length;
      console.log(JSON.stringify({type: "article", id: row.id, title: row.title, slug: row.slug,
        keywords, manualKeywords, tagChanges}));
    }
    for (const field of [keywords, manualKeywords, ...tags]) {
      if (field.review.length) console.log(JSON.stringify({type: "review", id: row.id, words: field.review}));
    }
  }
  const afterCounts = { articles: await tx.article.count(), tags: await tx.newsKeyword.count() };
  console.log(JSON.stringify({type: "summary", mode: "dry-run", scannedArticles: rows.length,
    changedArticles, changedFields, changedTags, beforeCounts, afterCounts, writes: 0}));
}, {timeout: 30000}).catch(error => {console.error(error); process.exitCode = 1;}).finally(() => db.$disconnect());
