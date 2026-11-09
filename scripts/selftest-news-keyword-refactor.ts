import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { prisma } from "../lib/prisma";
import { extractNewsKeywords, syncArticleKeywords, previewArticleKeywordCleanup } from "../lib/news-keywords-v2";
import * as rules from "../lib/news-keyword-rules";
import { cleanStoredKeywordField } from "../lib/news-keyword-history";
import { PENDING_BRAND_GENERATION_ENABLED } from "../lib/pending-brand-policy";

// All persistence below is an in-memory adapter. No live database is queried.
function createDatabase() {
  let state = {
    pending: new Map<string, any>(), observations: new Map<string, any>(),
    whitelist: new Map<string, any>(), articles: new Map<string, any>(), tags: new Map<string, any[]>(),
  };
  const tx: any = {
    pendingKeyword: {
      upsert: async ({ where, create, update }: any) => {
        const row = state.pending.get(where.word) ?? { id: where.word, ...create };
        Object.assign(row, update); state.pending.set(where.word, row); return row;
      },
      update: async ({ where, data }: any) => Object.assign(state.pending.get(where.id), data),
    },
    pendingKeywordArticle: {
      upsert: async ({ where, create, update }: any) => {
        const { keywordId, articleId } = where.keywordId_articleId;
        const key = keywordId + "|" + articleId;
        const row = state.observations.get(key) ?? create;
        Object.assign(row, update); state.observations.set(key, row); return row;
      },
      count: async ({ where }: any) => Array.from(state.observations.values())
        .filter((item) => item.keywordId === where.keywordId).length,
    },
    industryWhitelist: {
      findMany: async () => Array.from(state.whitelist.values()),
      upsert: async ({ where, create, update }: any) => {
        const row = state.whitelist.get(where.word) ?? create;
        Object.assign(row, update); state.whitelist.set(where.word, row); return row;
      },
    },
    article: {
      findUnique: async ({ where }: any) => state.articles.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = state.articles.get(where.id);
        if (!row) throw new Error("Missing article");
        Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) }); return row;
      },
      updateMany: async ({ where, data }: any) => {
        const row = state.articles.get(where.id);
        if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        await tx.article.update({ where, data }); return { count: 1 };
      },
    },
    newsKeyword: {
      deleteMany: async ({ where }: any) => state.tags.delete(where.newsId),
      createMany: async ({ data }: any) => state.tags.set(data[0].newsId, data),
    },
  };
  return {
    tx, get state() { return state; },
    transaction: async (run: (client: any) => Promise<any>) => {
      const before = structuredClone(state);
      try { return await run(tx); } catch (error) { state = before; throw error; }
    },
    article: (id: string) => state.articles.set(id, { id, keywords: "", manualKeywords: null, updatedAt: new Date(0) }),
  };
}

async function main() {
  assert.equal(PENDING_BRAND_GENERATION_ENABLED, true);
  for (const dirty of ["由周长亮担任旭辉集团", "根据旭辉集团", "除了旭辉集团", "根据除了旭辉集团"]) {
    assert.equal(rules.cleanEntityName(dirty), "旭辉集团");
  }
  for (const invalid of ["由", "的旭辉集团", "这是一段超过八个汉字的长句", "根据ABC集团"]) {
    assert.equal(rules.cleanEntityName(invalid), "");
  }
  assert.equal(rules.countKeywordOccurrences("中国建博会", ["中国建博会", "建博会"]), 1);
  assert.equal(rules.countKeywordOccurrences("WOCA woca XWOCA", ["WOCA", "woca"]), 2);
  assert.deepEqual(rules.mergeContainedKeywords([
    { keyword: "周长亮担任旭辉集团" }, { keyword: "旭辉集团" }, { keyword: "WOCA" }, { keyword: "woca" },
  ]).map((item) => item.keyword), ["旭辉集团", "WOCA"]);
  for (const dirty of ["依托大家居", "由旭辉集团", "根据旭辉集团", "除了旭辉集团", "七个汉字的词条", "全屋定制的未来"]) {
    assert.equal(rules.isDisplayNewsKeyword(dirty), false);
  }
  assert.equal(rules.isDisplayNewsKeyword("旭辉集团"), true);
  for (const normal of ["喜临门", "图森木作", "高定木作", "木作", "整木工厂管理问题", "WOCA强力木制品清洁剂"]) {
    assert.deepEqual(cleanStoredKeywordField(normal), { before: normal, after: normal, changed: false, changes: [], review: [] });
  }
  assert.equal(rules.cleanEntityName("由于整木"), "整木");
  assert.equal(rules.cleanEntityName("以下简称新明珠集团"), "新明珠集团");
  assert.equal(rules.cleanEntityName("以下未知木作"), "");
  assert.equal(cleanStoredKeywordField("以下未知木作").after, "以下未知木作");
  assert.equal(cleanStoredKeywordField(" 高定木作，木作;由周长亮担任旭辉集团\n喜临门 ").after,
    " 高定木作，木作;旭辉集团\n喜临门 ");
  assert.equal(cleanStoredKeywordField("被视作这位家居").changed, false);
  assert.equal(cleanStoredKeywordField("为北京最为国际").changed, false);
  assert.equal(cleanStoredKeywordField(null).after, null);
  assert.equal(cleanStoredKeywordField("").after, "");
  assert.equal(cleanStoredKeywordField("由木家居", new Set(["由木家居"])).changed, false);
  assert.deepEqual(rules.mergeContainedKeywords([{ keyword: "图森木作" }, { keyword: "图森" },
    { keyword: "高定木作" }, { keyword: "木作" }]).map((item) => item.keyword), ["图森木作", "图森", "高定木作", "木作"]);
  const db = createDatabase();
  const original = { findMany: prisma.industryWhitelist.findMany,
    findUnique: prisma.article.findUnique, transaction: prisma.$transaction };
  prisma.industryWhitelist.findMany = db.tx.industryWhitelist.findMany;
  prisma.article.findUnique = db.tx.article.findUnique;
  prisma.$transaction = db.transaction as any;
  try {
    db.state.whitelist.set("符合国际", { word: "符合国际", weight: 3, status: true, synonyms: null });
    assert.equal((await extractNewsKeywords({ title: "符合国际", content: "符合国际。" })).keywords.some((item) => item.keyword === "符合国际"), false);
    const normalManual = await previewArticleKeywordCleanup({ articleId: "probe", title: "图森木作", content: "高定木作和木作。",
      manualKeywords: "图森木作,高定木作,木作,喜临门" });
    assert.deepEqual(normalManual.manualKeywords, ["图森木作", "高定木作", "木作", "喜临门"]);
    db.state.whitelist.set("木作", { word: "木作", weight: 1, status: true, synonyms: null });
    const coexist = await extractNewsKeywords({ title: "高定木作与木作", content: "高定木作与木作。" });
    assert.ok(coexist.keywords.some((item) => item.keyword === "高定木作"));
    assert.ok(coexist.keywords.some((item) => item.keyword === "木作"));
    db.state.whitelist.delete("木作");
    const input = { title: "旭辉集团动态", content: "由周长亮担任旭辉集团，根据旭辉集团，除了旭辉集团。" };
    const preview = await extractNewsKeywords(input);
    assert.equal(preview.keywords.length, 0, "unknown entities must not be displayed");
    assert.deepEqual(preview.pendingKeywords.map((item) => item.keyword), ["旭辉集团"]);
    assert.equal(preview.pendingKeywords[0].frequency, 4, "one title and three body occurrences");
    assert.equal(db.state.pending.size, 0, "preview must not write learning data");
    for (const id of ["a", "b", "c", "stale", "import"]) db.article(id);
    const save = (articleId: string) => syncArticleKeywords({ articleId, ...input, manualKeywords: null });
    await save("a"); await save("a"); await save("a");
    assert.equal(db.state.pending.get("旭辉集团").count, 1, "edits count as one article");
    assert.equal(db.state.whitelist.has("旭辉集团"), false);
    await save("b");
    assert.equal(db.state.pending.get("旭辉集团").count, 2);
    assert.equal(db.state.whitelist.has("旭辉集团"), false);
    const third = await save("c");
    assert.deepEqual(third.promotedKeywords, []);
    assert.equal(db.state.pending.get("旭辉集团").count, 3);
    assert.equal(db.state.whitelist.has("旭辉集团"), false, "promotion stays disabled at three articles");
    assert.deepEqual(third.autoKeywords, []);
    await syncArticleKeywords({ articleId: "a", ...input, manualKeywords: null, learn: false });
    assert.deepEqual(db.state.tags.get("a")?.map((item) => item.keyword) ?? [], []);
    assert.equal(db.state.pending.get("旭辉集团").count, 3);
    const manual = await syncArticleKeywords({ articleId: "a", ...input,
      manualKeywords: "由周长亮担任旭辉集团,根据旭辉集团,除了旭辉集团" });
    assert.deepEqual(manual.manualKeywords, ["旭辉集团"]);
    assert.equal(db.state.articles.get("a").manualKeywords, "旭辉集团");
    assert.equal(db.state.tags.get("a")?.[0].isManual, true);
    const imported = await syncArticleKeywords({ articleId: "import", title: "云境木作新品",
      content: "云境木作推出新品。", canonicalKeywords: "云境木作" });
    assert.deepEqual(imported.activeKeywords, ["云境木作"], "explicit imported tags do not need whitelist membership");
    assert.equal(db.state.pending.get("云境木作").count, 1);
    const pendingSize = db.state.pending.size;
    await assert.rejects(syncArticleKeywords({ articleId: "stale", title: "青岭木作新品", content: "青岭木作。",
      manualKeywords: null, expectedUpdatedAt: new Date(999) }), /Article changed during keyword cleanup/);
    assert.equal(db.state.pending.size, pendingSize, "rollback also covers learning");
    db.state.whitelist.set("松境木作", { word: "松境木作", weight: 1, status: false, synonyms: null });
    for (const id of ["a", "b", "c"]) await syncArticleKeywords({ articleId: id,
      title: "松境木作", content: "松境木作", manualKeywords: null });
    assert.equal(db.state.whitelist.get("松境木作").status, false, "disabled entries stay disabled");
    const cleanup = await previewArticleKeywordCleanup({ articleId: "a", ...input, manualKeywords: "根据旭辉集团" });
    assert.deepEqual(cleanup.manualKeywords, ["旭辉集团"]);
    const known = await extractNewsKeywords({ title: "全屋定制", content: "全屋定制。" });
    assert.deepEqual(known.keywords.map((item) => item.keyword), ["全屋定制"], "do not pad");
    assert.equal((await extractNewsKeywords({ title: "天气", content: "晴朗。" })).keywords.length, 0);
    const event = await extractNewsKeywords({ title: "", content: "中国建博会" });
    assert.equal(event.keywords.find((item) => item.keyword === "中国建博会")?.score, 2.4,
      "one event mention must not receive the repeated-occurrence bonus");
    const longSentence = await extractNewsKeywords({ title: "", content: "周长亮持续全面负责旭辉集团。" });
    assert.equal(longSentence.pendingKeywords.length, 0, "do not learn an arbitrary tail from a long sentence");
    for (const word of ["长青木业", "杉木作"]) db.state.whitelist.set(word,
      { word, weight: 1, status: true, synonyms: null });
    const tied = await extractNewsKeywords({ title: "", content: "长青木业、杉木作。" });
    assert.deepEqual(tied.keywords.map((item) => item.keyword), ["杉木作", "长青木业"],
      "equal scores prefer the shorter name");
  } finally {
    prisma.industryWhitelist.findMany = original.findMany;
    prisma.article.findUnique = original.findUnique;
    prisma.$transaction = original.transaction;
    await prisma.$disconnect();
  }
  // Exercise actual component SSR registration, safe JSON and single insertion.
  const filename = path.join(process.cwd(), "components/NewsArticleJsonLd.tsx");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  let insert: (() => any) | undefined;
  const componentModule = { exports: {} as any };
  const componentRequire = (id: string) => id === "next/navigation"
    ? { useServerInsertedHTML: (callback: () => any) => { insert = callback; } }
    : id === "@/lib/news-keyword-rules" ? rules : require(id);
  new Function("require", "module", "exports", code)(componentRequire, componentModule, componentModule.exports);
  const schema = { "@context": "https://schema.org", "@type": "NewsArticle", headline: "</script><script>bad</script>",
    keywords: "旭辉集团", about: [{ "@type": "Thing", name: "旭辉集团" }] };
  assert.equal(renderToStaticMarkup(createElement(componentModule.exports.NewsArticleJsonLd, { data: schema })), "");
  assert.ok(insert, "must register server head insertion");
  const html = renderToStaticMarkup(insert!());
  assert.ok(html.includes('id="news-article-jsonld"'));
  assert.ok(!html.includes("<script>bad"));
  assert.deepEqual(JSON.parse(html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"))), schema);
  assert.equal(insert!(), null, "one JSON-LD block per server render");
  console.log("news keyword refactor selftest passed: cleaning, occurrences, quarantine, distinct articles, NO promotion, conservative history, entity coexistence, rollback, storage, SSR JSON-LD");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
