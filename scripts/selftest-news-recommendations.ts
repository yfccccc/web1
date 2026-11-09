import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { getRecommendedNews } from "../lib/news-keywords-v2";
import { cleanEntityName, isDisplayNewsKeyword } from "../lib/news-keyword-rules";
import { cleanStoredKeywordField } from "../lib/news-keyword-history";

async function main() {
  const original = { findUnique: prisma.article.findUnique, findMany: prisma.article.findMany,
    whitelist: prisma.industryWhitelist.findMany };
  let manual = true;
  const queries: any[] = [];
  const news = {id: "published-news", slug: "published-news-slug", title: "整木新闻",
    categoryHref: "/news", subHref: "/news/enterprise", status: "approved", excerpt: null,
    coverImage: null, publishedAt: new Date(), updatedAt: new Date(), keywords: "整木", manualKeywords: null};
  const records = [news, {...news, id: "dictionary", categoryHref: "/dictionary", subHref: "/dictionary/brand-baike"},
    {...news, id: "draft", status: "draft"}];
  prisma.article.findUnique = (async () => ({...news, id: "current", recommendIds: manual ? JSON.stringify(records.map(x => x.id)) : null})) as any;
  prisma.industryWhitelist.findMany = (async () => []) as any;
  prisma.article.findMany = (async (query: any) => {
    queries.push(query);
    assert.equal(query.where.status, "approved");
    assert.deepEqual(query.where.OR, [{categoryHref: "/news"}, {categoryHref: {startsWith: "/news/"}},
      {subHref: "/news"}, {subHref: {startsWith: "/news/"}}]);
    assert.equal(query.select.slug, true);
    return records.filter(row => row.status === query.where.status &&
      (row.categoryHref === "/news" || row.subHref.startsWith("/news/")));
  }) as any;
  try {
    for (const mode of [true, false]) {
      manual = mode;
      const result = await getRecommendedNews("current", 4);
      assert.deepEqual(result.map(x => x.id), ["published-news"]);
      assert.equal(result[0].slug, news.slug);
    }
    assert.equal(queries.length, 2, "both manual and automatic recommendation branches were exercised");
    for (const prefix of ["兼", "期内", "今年", "去年", "同期", "截至"]) {
      assert.equal(cleanEntityName(prefix + "地产集团"), "地产集团");
      assert.equal(cleanStoredKeywordField(prefix + "地产集团").after, "地产集团");
      assert.equal(isDisplayNewsKeyword(prefix + "地产集团"), false);
    }
    for (const word of ["图森木作", "高定木作", "喜临门", "广州"]) {
      assert.equal(cleanStoredKeywordField(word).after, word);
      assert.equal(isDisplayNewsKeyword(word), true);
    }
    console.log("PASS: manual/automatic recommendations exclude draft and dictionary; slug selected; six prefixes; normal tags preserved");
  } finally {
    prisma.article.findUnique = original.findUnique;
    prisma.article.findMany = original.findMany;
    prisma.industryWhitelist.findMany = original.whitelist;
    await prisma.$disconnect();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
