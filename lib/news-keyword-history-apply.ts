import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { cleanStoredKeywordField } from "./news-keyword-history";

type FieldPlan = { before: string | null; after: string | null; changed: boolean };
type TagPlan = { id: string; isManual: boolean; before: string; after: string; changed: boolean };
type ArticlePlan = { id: string; fields: { keywords: FieldPlan; manualKeywords: FieldPlan }; tagChanges: TagPlan[] };
type ReviewedPlan = { summary: { changedArticles: number; changedFields: number; changedTagRows: number }; articles: ArticlePlan[] };

export function validateReviewedKeywordPlan(input: unknown): ArticlePlan[] {
  const plan = input as ReviewedPlan;
  if (!plan || !Array.isArray(plan.articles) || plan.summary?.changedArticles !== 7 ||
      plan.summary.changedFields !== 7 || plan.summary.changedTagRows !== 6) throw new Error("Expected the approved 7-article / 6-tag preview");
  const articles = plan.articles.filter((row) => Object.values(row.fields).some((field) => field.changed) || row.tagChanges.length);
  const articleIds = new Set<string>(), tagIds = new Set<string>();
  let fields = 0;
  for (const row of articles) {
    if (!row.id || articleIds.has(row.id) || !Array.isArray(row.tagChanges)) throw new Error("Invalid or duplicate article");
    articleIds.add(row.id);
    for (const name of ["keywords", "manualKeywords"] as const) {
      const field = row.fields[name];
      if (!field || ![field.before, field.after].every((value) => value === null || typeof value === "string") ||
          field.changed !== (field.before !== field.after)) throw new Error("Invalid field plan");
      if (field.changed) {
        fields++;
        if (!field.after || cleanStoredKeywordField(field.before).after !== field.after) throw new Error("Plan differs from conservative string cleaning");
      }
    }
    for (const tag of row.tagChanges) {
      if (!tag.id || tagIds.has(tag.id) || typeof tag.before !== "string" || typeof tag.after !== "string" ||
          !tag.after || tag.before === tag.after || typeof tag.isManual !== "boolean" ||
          cleanStoredKeywordField(tag.before).after !== tag.after) throw new Error("Invalid tag plan");
      tagIds.add(tag.id);
    }
  }
  if (articles.length !== 7 || fields !== 7 || tagIds.size !== 6) throw new Error("Reviewed plan scope mismatch");
  return articles.sort((a, b) => a.id.localeCompare(b.id));
}

/** Atomic compare-and-set of the reviewed strings. No inserts, deletes, extraction or learning. */
export async function applyReviewedKeywordPlan(prisma: PrismaClient, reportPath: string, expectedHash: string) {
  if (!path.isAbsolute(reportPath) || !fs.realpathSync(reportPath).startsWith("/home/web1/backups/")) throw new Error("Plan must be in the private server backup directory");
  const bytes = fs.readFileSync(reportPath);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (digest !== expectedHash) throw new Error("Reviewed plan SHA-256 mismatch");
  const articles = validateReviewedKeywordPlan(JSON.parse(bytes.toString("utf8")));
  const backupFile = path.join(path.dirname(reportPath), "apply-targets-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.article.findMany({ where: { id: { in: articles.map((row) => row.id) }, categoryHref: "/news" },
      select: { id: true, keywords: true, manualKeywords: true, updatedAt: true, keywordItems: true } });
    if (rows.length !== 7) throw new Error("Approved news rows missing or category changed");
    for (const plan of articles) {
      const row = rows.find((item) => item.id === plan.id)!;
      if (row.keywords !== plan.fields.keywords.before || row.manualKeywords !== plan.fields.manualKeywords.before) {
        throw new Error("Article changed since preview: " + plan.id);
      }
      for (const tag of plan.tagChanges) {
        const current = row.keywordItems.find((item) => item.id === tag.id);
        if (!current || current.keyword !== tag.before || current.isManual !== tag.isManual) throw new Error("Tag changed since preview: " + tag.id);
      }
    }
    // A durable target backup must succeed before the first UPDATE.
    const fd = fs.openSync(backupFile, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ createdAt: new Date(), planSha256: digest, articles: rows }, null, 2)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    const beforeCounts = { articles: await tx.article.count(), tags: await tx.newsKeyword.count() };
    let articleUpdates = 0, tagUpdates = 0;
    for (const plan of articles) {
      const current = rows.find((item) => item.id === plan.id)!;
      const data: Prisma.ArticleUpdateManyMutationInput = { updatedAt: current.updatedAt };
      if (plan.fields.keywords.changed) data.keywords = plan.fields.keywords.after;
      if (plan.fields.manualKeywords.changed) data.manualKeywords = plan.fields.manualKeywords.after;
      const updated = await tx.article.updateMany({
        where: { id: plan.id, categoryHref: "/news", keywords: plan.fields.keywords.before,
          manualKeywords: plan.fields.manualKeywords.before, updatedAt: current.updatedAt }, data,
      });
      if (updated.count !== 1) throw new Error("Concurrent article edit; rolling back: " + plan.id);
      articleUpdates++;
      for (const tag of plan.tagChanges) {
        const updatedTag = await tx.newsKeyword.updateMany({
          where: { id: tag.id, newsId: plan.id, keyword: tag.before, isManual: tag.isManual }, data: { keyword: tag.after! },
        });
        if (updatedTag.count !== 1) throw new Error("Concurrent tag edit; rolling back: " + tag.id);
        tagUpdates++;
      }
    }
    const afterCounts = { articles: await tx.article.count(), tags: await tx.newsKeyword.count() };
    if (beforeCounts.articles !== afterCounts.articles || beforeCounts.tags !== afterCounts.tags) throw new Error("Row counts changed; rolling back");
    return { mode: "apply", articleUpdates, tagUpdates, beforeCounts, afterCounts, backupFile, planSha256: digest };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return result;
}
