import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

// Approval scope: exactly one Article.keywords field and its one NewsKeyword row.
const ARTICLE_ID = "cmw8s071f0jgcl8z9vnil2zwu";
const TAG_ID = "cmw8s07200jghl8z94f5lgzg2";
const REVIEW_ARTICLE_ID = "cmvkph1nf000hg9691oukciba";
const BEFORE = "兼地产集团", AFTER = "地产集团";
const expectedKeywords = "碧桂园,裁助理一路升任到集团,兼地产集团,期内集团,广州";
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg !== "--apply")) throw new Error("Usage: apply-approved-residual-keyword.ts [--apply]");
const apply = args.includes("--apply");
if (process.cwd() !== "/home/web1") throw new Error("Run only from /home/web1");
const match = fs.readFileSync("/home/web1/.env", "utf8").match(/^DATABASE_URL\s*=\s*(.*)$/m);
if (!match) throw new Error("Missing production DATABASE_URL");
process.env.DATABASE_URL = match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
const db = new PrismaClient();

db.$transaction(async tx => {
  if (!apply) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  const counts = async () => ({articles: await tx.article.count(), tags: await tx.newsKeyword.count()});
  const beforeCounts = await counts();
  const article = await tx.article.findUnique({where: {id: ARTICLE_ID},
    select: {id: true, status: true, categoryHref: true, keywords: true, manualKeywords: true, updatedAt: true}});
  const tag = await tx.newsKeyword.findUnique({where: {id: TAG_ID}});
  const reviewArticle = await tx.article.findUnique({where: {id: REVIEW_ARTICLE_ID},
    select: {id: true, keywords: true, manualKeywords: true, updatedAt: true}});
  const protectedTags = await tx.newsKeyword.findMany({where: {keyword: {in: ["期内集团", "兼具国际"]}}, orderBy: {id: "asc"}});
  if (!article || article.status !== "approved" || article.categoryHref !== "/news" ||
      article.keywords !== expectedKeywords || !tag || tag.newsId !== ARTICLE_ID || tag.keyword !== BEFORE ||
      !reviewArticle?.keywords?.split(",").includes("兼具国际")) {
    throw new Error("Reviewed values or publication scope changed; aborting without updates");
  }
  const newKeywords = article.keywords.split(",").map(word => word === BEFORE ? AFTER : word).join(",");
  if (!apply) {
    console.log(JSON.stringify({mode: "dry-run", articleId: ARTICLE_ID, tagId: TAG_ID,
      before: article.keywords, after: newKeywords, beforeCounts, plannedArticleUpdates: 1, plannedTagUpdates: 1, writes: 0}));
    return;
  }
  const backupDir = "/home/web1/backups";
  fs.mkdirSync(backupDir, {recursive: true, mode: 0o700});
  const backupFile = path.join(backupDir, "approved-residual-keyword-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  const fd = fs.openSync(backupFile, "wx", 0o600);
  try {fs.writeFileSync(fd, JSON.stringify({article, tag, reviewArticle, protectedTags, beforeCounts}, null, 2)); fs.fsyncSync(fd);}
  finally {fs.closeSync(fd);}
  const changedArticle = await tx.article.updateMany({where: {id: ARTICLE_ID, status: "approved", categoryHref: "/news",
    keywords: article.keywords, manualKeywords: article.manualKeywords, updatedAt: article.updatedAt},
    data: {keywords: newKeywords, updatedAt: article.updatedAt}});
  const changedTag = await tx.newsKeyword.updateMany({where: {id: TAG_ID, newsId: ARTICLE_ID, keyword: BEFORE, isManual: tag.isManual}, data: {keyword: AFTER}});
  if (changedArticle.count !== 1 || changedTag.count !== 1) throw new Error("Concurrent edit; rolling back");
  const afterCounts = await counts();
  const current = await tx.article.findUnique({where: {id: ARTICLE_ID}, select: {keywords: true, manualKeywords: true}});
  const currentTag = await tx.newsKeyword.findUnique({where: {id: TAG_ID}, select: {keyword: true}});
  const protectedAfter = await tx.newsKeyword.findMany({where: {keyword: {in: ["期内集团", "兼具国际"]}}, orderBy: {id: "asc"}});
  const reviewAfter = await tx.article.findUnique({where: {id: REVIEW_ARTICLE_ID},
    select: {id: true, keywords: true, manualKeywords: true, updatedAt: true}});
  if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts) || current?.keywords !== newKeywords ||
      current.manualKeywords !== article.manualKeywords || currentTag?.keyword !== AFTER ||
      JSON.stringify(protectedTags) !== JSON.stringify(protectedAfter) || JSON.stringify(reviewArticle) !== JSON.stringify(reviewAfter)) {
    throw new Error("Verification failed; rolling back");
  }
  console.log(JSON.stringify({mode: "apply", articleUpdates: changedArticle.count, tagUpdates: changedTag.count,
    articleId: ARTICLE_ID, tagId: TAG_ID, keywords: current.keywords, beforeCounts, afterCounts,
    protectedValuesUnchanged: true, backupFile}));
}, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000})
  .catch(error => {console.error(error); process.exitCode = 1;}).finally(() => db.$disconnect());
