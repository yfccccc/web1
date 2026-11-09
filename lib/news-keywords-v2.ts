import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPublishedNewsWhere } from "@/lib/news-listing";
import { stripHtml } from "@/lib/text";
import {
  INDUSTRY_WHITELIST_SEED,
  NEWS_BRAND_CONTEXT_PATTERNS,
  NEWS_BRAND_FORBIDDEN_CONTAINS,
  NEWS_BRAND_SUFFIXES,
  NEWS_PENDING_BRAND_BLACKLIST,
  NEWS_STOPWORDS,
} from "@/lib/news-keyword-config-v2";
import { NEWS_DISABLED_KEYWORDS, NEWS_ENTITY_STRIP_PREFIXES } from "@/lib/news-keyword-config-v2";
import { cleanEntityName, hasIllegalEntityAffix, countKeywordOccurrences, keywordIdentity, mergeContainedKeywords } from "@/lib/news-keyword-rules";
import { learnPendingKeywords } from "@/lib/news-keyword-learning";
import { applyPendingBrandPolicy } from "@/lib/pending-brand-policy";
export { cleanEntityName } from "@/lib/news-keyword-rules";

const KEYWORD_MARKETING_TERMS_CN = [
  "\u90fd",
  "\u4e86",
  "\u4e00\u4e2a",
  "\u8fd9\u4e2a",
  "\u90a3\u4e2a",
  "\u95ee\u9898",
  "\u9519\u8bef",
  "\u4e3a\u4ec0\u4e48",
  "\u5982\u4f55",
  "\u4e25\u91cd",
  "\u5343\u4e07\u4e0d\u8981",
  "\u4e00\u5b9a\u8981",
];
const KEYWORD_PUNCTUATION_CN = /[\uFF0C\u3002\uFF1A\uFF1B;!\uFF01\uFF1F?%]/;
const KEYWORD_SENTENCE_LIKE_PATTERNS = [
  /\u906d\u9047/,
  /\u60ca\u9b42/,
  /\u4e00\u523b$/,
  /\u771f\u76f8/,
  /\u59cb\u672b/,
  /\u80cc\u540e/,
  /\u4e3a\u4ec0\u4e48/,
  /\u5982\u4f55/,
  /\u4ec0\u4e48/,
  /\u4e0d\u8981/,
  /\u4e00\u5b9a\u8981/,
  /\u8b66\u60d5/,
  /\u6ce8\u610f/,
  /\u63ed\u79d8/,
  /\u66dd\u5149/,
  /\u5b9e\u5f55/,
  /\u73b0\u573a/,
  /\u6545\u4e8b/,
  /\u56e0\u4e3a/,
  /\u6574\u4e2a/,
  /\u8fd9\u51e0\u5929/,
  /\u5fc5\u987b/,
  /\u4e09\u4ef6\u4e8b/,
];
const KEYWORD_INDUSTRY_SIGNALS = [
  "\u6574\u6728",
  "\u6728\u4f5c",
  "\u5b9a\u5236",
  "\u5bb6\u5c45",
  "\u5bb6\u88c5",
  "\u9ad8\u5b9a",
  "\u5168\u5c4b",
  "\u6574\u5bb6",
  "\u677f\u6750",
  "\u9970\u9762",
  "\u62a4\u5899\u677f",
  "\u6728\u95e8",
  "\u9152\u67dc",
  "\u4e66\u67dc",
  "\u8863\u5e3d\u95f4",
  "\u697c\u68af",
  "\u80cc\u666f\u5899",
  "\u5efa\u535a\u4f1a",
  "\u8bbe\u8ba1\u5468",
  "\u5bb6\u535a\u4f1a",
  "\u534f\u4f1a",
  "\u5de5\u827a",
  "\u6c34\u6027\u6f06",
  "\u5f00\u653e\u6f06",
  "\u70e4\u6f06",
  "\u69ab\u536f",
  "\u539f\u6728",
  "\u6728\u76ae",
  "\u522b\u5885",
  "\u5927\u5b85",
  "\u8c6a\u5b85",
];
const KEYWORD_MULTI_DIGITS = /\d{2,}/;
const KEYWORD_SPLIT_PATTERN_CN = /[\uFF0C\u3002\uFF1A\uFF1B\uFF01\uFF1F\u3001\s()\uFF08\uFF09\u3010\u3011\u300a\u300b\u201c\u201d"'\/\|-]+/;
const KEYWORD_BLOCKED_PREFIXES = [
  "因为",
  "所以",
  "但是",
  "如果",
  "如何",
  "怎么",
  "为什么",
  "哪些",
  "这些",
  "那些",
  "一个",
  "一种",
  "很多",
  "最后",
  "真正",
  "不要",
  "千万",
  "应该",
  "可以",
  "需要",
  "不是",
  "成为",
  "关系",
  "不该",
  "重新",
  "提醒",
  "欢迎",
  "选择",
  "采用",
  "体系",
  "实地考察",
  "做",
  "让",
  "把",
  "给",
  "从",
  "在",
  "对",
  "用",
  "选购",
  "考察",
];
const KEYWORD_BLOCKED_EXACT = [
  "内容",
  "栏目",
  "文章",
  "官网",
  "资料",
  "搜索",
  "抓取",
  "优化",
  "投毒",
  "收录",
  "页面",
  "链接",
  "发布",
  "审核",
  "后台",
  "入口",
];
const KEYWORD_BLOCKED_CONTAINS = ["实地考察", "体系选购", "选购", "整体空间", "第一步", "连接老客户"];
const KEYWORD_ALLOWED_LONG_TERMS = ["戴夫人全屋定制", "世家屋原木定制", "Rubio Monocoat"];
const KEYWORD_ALLOWED_MULTIWORD_LATIN = /^[A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){1,2}$/;

type WhitelistEntry = {
  word: string;
  category: string;
  weight: number;
  synonyms: string[];
};

type KeywordCandidateSource = "whitelist" | "title" | "ner";

type KeywordCandidate = {
  keyword: string;
  source: KeywordCandidateSource;
  weight: number;
  frequency: number;
  inTitle: boolean;
  inLead: boolean;
  score: number;
  contexts: string[];
  ruleSource?: string;
};

export type ExtractedKeyword = {
  keyword: string;
  score: number;
  weight: number;
  source: KeywordCandidateSource;
};

export type KeywordExtractionResult = {
  keywords: ExtractedKeyword[];
  pendingKeywords: Array<ExtractedKeyword & { frequency: number; sourceContext: string }>;
  pendingBrands: Array<{
    brandName: string;
    sourceContext: string;
    frequency: number;
    ruleSource: string;
    triggerReason: string | null;
    confidence: number;
  }>;
};

type ArticleKeywordInput = {
  title: string;
  content: string;
  city?: string | null;
  keywordHints?: string[];
};

type KeywordValidationContext = {
  title?: string;
  content?: string;
};

function normalizeText(input: string) {
  return stripHtml(input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[‘’“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedKeywordLength(input: string) {
  return normalizeText(input).replace(/\s+/g, "").length;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function splitSentences(input: string) {
  return normalizeText(input)
    .split(/[\u3002\uFF01\uFF1F\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeKeywordList(input: string | null | undefined) {
  return unique(
    (input || "")
      .split(/[，,、;；\n]+/)
      .map((item) => normalizeText(item))
      .map((item) => hasIllegalEntityAffix(item) ? cleanEntityName(item) : item)
      .filter((item) => validateArticleKeyword(item)),
  ).slice(0, 5);
}

export function formatImportedKeywordCsv(input: string | null | undefined) {
  return normalizeKeywordList(input).join(",");
}

function clampKeywordLength(input: string) {
  const compactLength = normalizedKeywordLength(input);
  if (compactLength < 2) return false;
  if (compactLength <= 12) return true;
  return KEYWORD_ALLOWED_LONG_TERMS.includes(input);
}

function isNoiseKeyword(input: string) {
  return (
    !input ||
    !/[A-Za-z0-9\u4e00-\u9fa5]/.test(input) ||
    input.length < 2 ||
    NEWS_STOPWORDS.includes(input) ||
    NEWS_PENDING_BRAND_BLACKLIST.includes(input)
  );
}

function countMatchedTerms(input: string, terms: string[]) {
  return terms.reduce((count, term) => count + (input.includes(term) ? 1 : 0), 0);
}

function hasIndustrySignal(input: string) {
  return (
    KEYWORD_INDUSTRY_SIGNALS.some((term) => input.includes(term)) ||
    NEWS_BRAND_SUFFIXES.some((suffix) => input.endsWith(suffix))
  );
}

function hasBlockedKeywordPrefix(input: string) {
  return KEYWORD_BLOCKED_PREFIXES.some((prefix) => input.startsWith(prefix));
}

function looksLikeEntityKeyword(input: string) {
  return (
    /^[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z0-9]+){0,2}$/.test(input) ||
    NEWS_BRAND_SUFFIXES.some((suffix) => input.endsWith(suffix)) ||
    /^[\u4e00-\u9fa5]{2,8}$/.test(input)
  );
}

function hasOperationalNoise(input: string) {
  return KEYWORD_BLOCKED_EXACT.some((term) => input.includes(term));
}

function hasBlockedKeywordContains(input: string) {
  return KEYWORD_BLOCKED_CONTAINS.some((term) => input.includes(term));
}

export function validateArticleKeyword(text: string, _context?: KeywordValidationContext) {
  const input = normalizeText(text);
  if (!input || NEWS_DISABLED_KEYWORDS.some((word) => keywordIdentity(word) === keywordIdentity(input)) || !clampKeywordLength(input)) return false;
  if (isNoiseKeyword(input)) return false;
  if (KEYWORD_BLOCKED_EXACT.includes(input)) return false;
  if (hasBlockedKeywordPrefix(input)) return false;
  if (NEWS_ENTITY_STRIP_PREFIXES.some((prefix) => input.startsWith(prefix))) return false;
  if (hasBlockedKeywordContains(input)) return false;
  if (hasOperationalNoise(input) && !hasIndustrySignal(input) && !/^[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z0-9]+){0,2}$/.test(input)) return false;
  if (KEYWORD_PUNCTUATION_CN.test(input)) return false;
  if (KEYWORD_MULTI_DIGITS.test(input)) return false;
  if (countMatchedTerms(input, KEYWORD_MARKETING_TERMS_CN) >= 2) return false;
  if (/\s/.test(input) && !KEYWORD_ALLOWED_MULTIWORD_LATIN.test(input)) return false;
  if (!/^[A-Za-z0-9\u4e00-\u9fa5\s]+$/.test(input)) return false;
  if (KEYWORD_SENTENCE_LIKE_PATTERNS.some((pattern) => pattern.test(input)) && !hasIndustrySignal(input) && !looksLikeEntityKeyword(input)) {
    return false;
  }
  return true;
}

export const isValidKeywordCandidate = validateArticleKeyword;

function safeParseJsonArray(input: string | null | undefined) {
  if (!input) return [] as string[];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function loadWhitelistEntries() {
  const rows = await prisma.industryWhitelist.findMany({
    select: {
      word: true,
      category: true,
      weight: true,
      synonyms: true,
      status: true,
    },
    orderBy: [{ weight: "desc" }, { word: "asc" }],
  }).catch(() => []);

  const merged = new Map<string, WhitelistEntry>();

  for (const item of INDUSTRY_WHITELIST_SEED) {
    if (NEWS_DISABLED_KEYWORDS.includes(item.word)) continue;
    merged.set(keywordIdentity(item.word), {
      word: item.word,
      category: item.category,
      weight: item.weight,
      synonyms: item.synonyms ?? [],
    });
  }

  for (const row of rows) {
    if (!row.status || NEWS_DISABLED_KEYWORDS.includes(row.word)) {
      merged.delete(keywordIdentity(row.word));
      continue;
    }
    merged.set(keywordIdentity(row.word), {
      word: row.word,
      category: row.category,
      weight: row.weight,
      synonyms: safeParseJsonArray(row.synonyms),
    });
  }

  return Array.from(merged.values()).sort((a, b) => b.word.length - a.word.length || b.weight - a.weight);
}

function buildWhitelistLookup(entries: WhitelistEntry[]) {
  const canonicalByAlias = new Map<string, WhitelistEntry>();

  for (const entry of entries) {
    for (const alias of unique([entry.word, ...entry.synonyms]).filter((word) => !NEWS_DISABLED_KEYWORDS.includes(word))) {
      const key = keywordIdentity(alias);
      if (key) canonicalByAlias.set(key, entry);
    }
  }

  return canonicalByAlias;
}

function getKeywordWeightFromLookup(keyword: string, lookup: Map<string, WhitelistEntry>) {
  return lookup.get(keywordIdentity(keyword))?.weight ?? 1;
}

function collectWhitelistMatches(bodyText: string, title: string, entries: WhitelistEntry[]) {
  const sourceText = normalizeText(bodyText);
  const titleText = normalizeText(title);
  const documentText = titleText + "\n" + sourceText;
  const lead = sourceText.slice(0, 200);
  const matches = new Map<string, KeywordCandidate>();
  for (const entry of entries) {
    if (!validateArticleKeyword(entry.word)) continue;
    const aliases = unique([entry.word, ...entry.synonyms]).filter((word) => !NEWS_DISABLED_KEYWORDS.includes(word));
    const frequency = countKeywordOccurrences(documentText, aliases);
    if (!frequency) continue;
    const inTitle = countKeywordOccurrences(titleText, aliases) > 0;
    const inLead = countKeywordOccurrences(lead, aliases) > 0;
    const frequencyWeight = Math.min(1.5, 1 + Math.log(frequency));
    matches.set(keywordIdentity(entry.word), {
      keyword: entry.word,
      source: "whitelist",
      weight: entry.weight,
      frequency,
      inTitle,
      inLead,
      score: entry.weight * (inTitle ? 1.15 : 1) * (inLead ? 1.2 : 1) * frequencyWeight,
      contexts: [],
    });
  }
  return matches;
}

function isValidEntityKeywordCandidate(input: string, _whitelistLookup: Map<string, WhitelistEntry>) {
  if (!validateArticleKeyword(input)) return false;
  if (NEWS_BRAND_FORBIDDEN_CONTAINS.some((item) => input.includes(item))) return false;
  if (["上海","南浔","湖州","南通","杭州","广州","深圳","北京","苏州","南京","成都","重庆","宁波","无锡","东莞","佛山"].includes(input)) return false;
  if (["协会","品牌","企业","集团","公司","行业","负责人"].includes(input)) return false;
  return true;
}

function collectNerCandidates(
  text: string,
  title: string,
  whitelistLookup: Map<string, WhitelistEntry>,
  hints: string[] = [],
) {
  const bodyText = normalizeText(text);
  const titleText = normalizeText(title);
  const sourceText = titleText + "\n" + bodyText;
  const lead = bodyText.slice(0, 200);
  const sentences = splitSentences(sourceText);
  const found = new Map<string, KeywordCandidate>();
  const pushCandidate = (raw: string, ruleSource: string) => {
    const entry = whitelistLookup.get(keywordIdentity(raw));
    const keyword = entry?.word ?? cleanEntityName(raw);
    if (!keyword || !isValidEntityKeywordCandidate(keyword, whitelistLookup)) return;
    const key = keywordIdentity(keyword);
    const previous = found.get(key);
    if (previous) {
      previous.ruleSource = unique([previous.ruleSource, ruleSource].filter(Boolean)).join("+");
      return; // Multiple rules are evidence, not additional occurrences.
    }
    const aliases = entry ? [entry.word, ...entry.synonyms] : [keyword];
    const frequency = countKeywordOccurrences(sourceText, aliases);
    if (!frequency) return;
    const inTitle = countKeywordOccurrences(titleText, aliases) > 0;
    const inLead = countKeywordOccurrences(lead, aliases) > 0;
    found.set(key, {
      keyword, source: "ner", weight: 1, frequency, inTitle, inLead,
      score: (inTitle ? 2 : 1) * (inLead ? 1.2 : 1)
        * Math.min(1.5, 1 + Math.log(frequency)) + 0.5,
      contexts: sentences.filter((sentence) => sentence.includes(keyword)).slice(0, 3),
      ruleSource,
    });
  };

  for (const pattern of NEWS_BRAND_CONTEXT_PATTERNS) {
    for (const match of Array.from(sourceText.matchAll(new RegExp(pattern)))) {
      if (match[1]) pushCandidate(match[1], "context");
    }
  }
  // Start at a Chinese-run boundary instead of taking an arbitrary 8-char tail.
  // Keep enough context to strip introductory/person-role text, then require a
  // complete 2-8-Han entity. The suffix cannot end in the middle of another name.
  const suffixRegex = /(?<![A-Za-z0-9\u4e00-\u9fa5])([\u4e00-\u9fa5]{2,40}?(?:木业|木作|家居|家私|整木|集团|国际))(?=$|[^\u4e00-\u9fa5]|的|在|于|又|再|被|已|是|与|和|发布|亮相|签约|宣布|携)/g;
  for (const match of Array.from(sourceText.matchAll(suffixRegex))) pushCandidate(match[1], "suffix");

  const tokens = unique(sourceText.split(KEYWORD_SPLIT_PATTERN_CN).filter(Boolean));
  for (const token of tokens) {
    if (NEWS_BRAND_SUFFIXES.some((suffix) => token.endsWith(suffix))) {
      pushCandidate(token, "suffix-token");
    }
  }
  for (const hint of hints) pushCandidate(hint, "saved-keyword");
  return found;
}

function rankKeywords(candidates: KeywordCandidate[]): ExtractedKeyword[] {
  return mergeContainedKeywords(candidates)
    .filter((item) => validateArticleKeyword(item.keyword))
    .sort((a, b) => b.score - a.score || b.weight - a.weight || a.keyword.length - b.keyword.length)
    .slice(0, 5)
    .map(({ keyword, score, weight, source }) => ({ keyword, score: Number(score.toFixed(2)), weight, source }));
}

function extractWithWhitelist(input: ArticleKeywordInput, entries: WhitelistEntry[]): KeywordExtractionResult {
  const title = normalizeText(input.title || "");
  const content = normalizeText((input.city ? input.city + " " : "") + (input.content || ""));
  const lookup = buildWhitelistLookup(entries);
  const known = collectWhitelistMatches(content, title, entries);
  const discovered = collectNerCandidates(content, title, lookup, input.keywordHints);
  const pool = mergeContainedKeywords([
    ...Array.from(known.values()),
    ...Array.from(discovered.entries()).filter(([key]) => !known.has(key)).map(([, item]) => item),
  ]);
  const pendingKeywords = pool
    .filter((item) => !lookup.has(keywordIdentity(item.keyword)))
    .map((item) => ({
      keyword: item.keyword, score: item.score, weight: 1, source: item.source,
      frequency: item.frequency, sourceContext: item.contexts[0] ?? "",
    }));
  return {
    // Unknown entities stay pending; automatic promotion is disabled.
    pendingKeywords,
    ...applyPendingBrandPolicy({
      keywords: rankKeywords(pool.filter((item) => lookup.has(keywordIdentity(item.keyword)))),
      pendingBrandCandidates: pendingKeywords.map((item) => ({
        brandName: item.keyword, sourceContext: item.sourceContext, frequency: item.frequency,
        ruleSource: "clean-entity", triggerReason: "automatic-promotion-disabled", confidence: 0.5,
      })),
    }),
  };
}

export async function extractNewsKeywords(input: ArticleKeywordInput): Promise<KeywordExtractionResult> {
  // Preview is deliberately read-only: it has no independent saved article ID.
  return extractWithWhitelist(input, await loadWhitelistEntries());
}

function approvedKeywordList(values: string[], entries: WhitelistEntry[]): string[] {
  const lookup = buildWhitelistLookup(entries);
  return mergeContainedKeywords(values
    .map((value) => lookup.get(keywordIdentity(value))?.word ?? value)
    .filter((keyword): keyword is string => Boolean(keyword) && validateArticleKeyword(keyword!))
    .map((keyword) => ({ keyword })))
    .slice(0, 5).map((item) => item.keyword);
}

type KeywordSyncOptions = {
  articleId: string;
  title: string;
  content: string;
  manualKeywords?: string | null;
  canonicalKeywords?: string | null;
  learn?: boolean;
  expectedUpdatedAt?: Date;
};

export async function previewArticleKeywordCleanup(options: KeywordSyncOptions) {
  const entries = await loadWhitelistEntries();
  const imported = normalizeKeywordList(options.canonicalKeywords);
  const manual = imported.length ? imported : normalizeKeywordList(options.manualKeywords);
  const result = extractWithWhitelist({ ...options, keywordHints: manual }, entries);
  const autoKeywords = imported.length
    ? approvedKeywordList(imported, entries) : result.keywords.map((item) => item.keyword);
  const manualKeywords = approvedKeywordList(manual, entries);
  return {
    autoKeywords, manualKeywords,
    activeKeywords: manualKeywords.length ? manualKeywords : autoKeywords,
    pendingKeywords: result.pendingKeywords,
  };
}

export async function syncArticleKeywords(options: KeywordSyncOptions) {
  const saved = options.manualKeywords === undefined
    ? await prisma.article.findUnique({ where: { id: options.articleId }, select: { manualKeywords: true } })
    : null;
  const entries = await loadWhitelistEntries();
  const imported = normalizeKeywordList(options.canonicalKeywords);
  const requestedManual = imported.length ? imported : normalizeKeywordList(options.manualKeywords ?? saved?.manualKeywords);
  const result = extractWithWhitelist({ ...options, keywordHints: requestedManual }, entries);
  return prisma.$transaction(async (tx) => {
    const promoted = options.learn === false ? []
      : await learnPendingKeywords(tx, options.articleId, result.pendingKeywords);
    const available = [...entries, ...promoted.map((word) => ({ word, category: "自动发现", weight: 1, synonyms: [] }))];
    const refreshed = extractWithWhitelist({ ...options, keywordHints: requestedManual }, available);
    const autoKeywords = imported.length ? approvedKeywordList(imported, available)
      : refreshed.keywords.map((item) => item.keyword);
    const manualKeywords = approvedKeywordList(requestedManual, available);
    const activeKeywords = manualKeywords.length ? manualKeywords : autoKeywords;
    const data = { keywords: autoKeywords.join(","), manualKeywords: manualKeywords.join(",") || null };
    if (options.expectedUpdatedAt) {
      const changed = await tx.article.updateMany({
        where: { id: options.articleId, updatedAt: options.expectedUpdatedAt }, data,
      });
      if (changed.count !== 1) throw new Error("Article changed during keyword cleanup: " + options.articleId);
    } else {
      await tx.article.update({ where: { id: options.articleId }, data });
    }
    await tx.newsKeyword.deleteMany({ where: { newsId: options.articleId } });
    if (activeKeywords.length) await tx.newsKeyword.createMany({
      data: activeKeywords.map((keyword, index) => ({
        newsId: options.articleId, keyword,
        weightScore: manualKeywords.includes(keyword) ? String(100 - index)
          : String(refreshed.keywords.find((item) => item.keyword === keyword)?.score ?? 1),
        isManual: manualKeywords.includes(keyword), sortOrder: index,
      })),
    });
    return { autoKeywords, activeKeywords, manualKeywords, promotedKeywords: promoted };
  }, { maxWait: 10000, timeout: 30000 });
}

type RelatedArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  subHref: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  keywords: string | null;
  manualKeywords: string | null;
  sourceType?: string | null;
  contentLine?: string | null;
  keywordIntent?: string | null;
};

function parseRecommendIds(input: string | null | undefined) {
  if (!input) return [] as string[];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getArticleKeywordList(article: Pick<RelatedArticle, "keywords" | "manualKeywords">) {
  return normalizeKeywordList(article.manualKeywords || article.keywords);
}

function getSearchIntentSignals(title: string) {
  const normalized = normalizeText(title);
  return unique(
    [
      /询盘|获客|接单|成交|转化/.test(normalized) ? "lead" : "",
      /官网|网站|内容|案例|FAQ|小红书|抖音/.test(normalized) ? "content" : "",
      /AI|智能/.test(normalized) ? "ai" : "",
      /预算|报价|价格|多少钱|费用/.test(normalized) ? "budget" : "",
      /工期|交付|验收|合同|售后/.test(normalized) ? "delivery" : "",
      /木门|护墙板|柜体|楼梯|背景墙|原木|全屋/.test(normalized) ? "product" : "",
    ].filter(Boolean),
  );
}

function diversifyRecommendations<T extends RelatedArticle & { recommendScore: number }>(items: T[], limit: number) {
  const result: T[] = [];
  let aiCount = 0;

  for (const item of items) {
    const isAi = item.sourceType === "ai_generated";
    if (isAi && aiCount >= Math.max(2, Math.ceil(limit / 2))) continue;
    result.push(item);
    if (isAi) aiCount += 1;
    if (result.length >= limit) break;
  }

  if (result.length >= limit) return result;
  const used = new Set(result.map((item) => item.id));
  return [...result, ...items.filter((item) => !used.has(item.id))].slice(0, limit);
}

export async function getRecommendedNews(articleId: string, limit = 8) {
  try {
    const current = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        subHref: true,
        keywords: true,
        manualKeywords: true,
        recommendIds: true,
        sourceType: true,
        contentLine: true,
        keywordIntent: true,
      },
    });

    if (!current) return [];

    const manualIds = parseRecommendIds(current.recommendIds);
    if (manualIds.length > 0) {
      return prisma.article.findMany({
        where: {
          id: { in: manualIds.filter((id) => id !== articleId) },
          ...buildPublishedNewsWhere(),
        },
        take: limit,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverImage: true,
          subHref: true,
          publishedAt: true,
          updatedAt: true,
          keywords: true,
          manualKeywords: true,
          sourceType: true,
          contentLine: true,
          keywordIntent: true,
        },
      });
    }

    const entries = await loadWhitelistEntries();
    const lookup = buildWhitelistLookup(entries);
    const currentKeywords = getArticleKeywordList(current);
    const coreKeywords = currentKeywords.slice(0, 3);

    const candidates = await prisma.article.findMany({
      where: {
        ...buildPublishedNewsWhere(),
        id: { not: articleId },
      },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: 80,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        subHref: true,
        publishedAt: true,
        updatedAt: true,
        keywords: true,
        manualKeywords: true,
        sourceType: true,
        contentLine: true,
        keywordIntent: true,
      },
    });

    const scored = candidates
      .map((candidate) => {
        const candidateKeywords = getArticleKeywordList(candidate);
        const overlap = coreKeywords.filter((keyword) => candidateKeywords.includes(keyword));
        const overlapCount = overlap.length;
        const currentSignals = getSearchIntentSignals(current.title);
        const candidateSignals = getSearchIntentSignals(candidate.title);
        const intentOverlap = currentSignals.filter((item) => candidateSignals.includes(item)).length;

        let score = overlapCount >= 3 ? 5 : overlapCount === 2 ? 3 : overlapCount === 1 ? 1 : 0;
        score += coreKeywords.filter((keyword) => candidate.title.includes(keyword)).length * 0.5;
        score += overlap.reduce((sum, keyword) => sum + (getKeywordWeightFromLookup(keyword, lookup) === 3 ? 1 : 0), 0);
        score += current.contentLine && candidate.contentLine === current.contentLine ? 2 : 0;
        score += current.keywordIntent && candidate.keywordIntent === current.keywordIntent ? 1.5 : 0;
        score += current.subHref && candidate.subHref === current.subHref ? 0.8 : 0;
        score += intentOverlap * 0.9;
        if (candidate.sourceType === "ai_generated" && current.sourceType === "ai_generated") score -= 0.8;
        if (/很多|为什么.*很多|怎么做.*很多/.test(candidate.title)) score -= 1.2;

        return { ...candidate, recommendScore: score };
      })
      .filter((item) => item.recommendScore > 0)
      .sort((a, b) => {
        const timeA = (a.publishedAt ?? a.updatedAt).getTime();
        const timeB = (b.publishedAt ?? b.updatedAt).getTime();
        return b.recommendScore - a.recommendScore || timeB - timeA;
      });

    if (scored.length >= 6) return diversifyRecommendations(scored, limit);

    const usedIds = new Set(scored.map((item) => item.id));
    const sameSection = candidates.filter((item) => item.subHref && item.subHref === current.subHref && !usedIds.has(item.id));
    const latest = candidates.filter((item) => !usedIds.has(item.id));
    return diversifyRecommendations([...scored, ...sameSection, ...latest]
      .filter((item, index, list) => list.findIndex((row) => row.id === item.id) === index)
      .map((item) => ({ ...item, recommendScore: "recommendScore" in item ? Number(item.recommendScore) : 0 })), limit);
  } catch {
    return [];
  }
}

export async function resolveCanonicalKeywordName(name: string) {
  const normalized = keywordIdentity(name);
  if (!normalized) return null;
  const entries = await loadWhitelistEntries();
  const lookup = buildWhitelistLookup(entries);
  return lookup.get(normalized)?.word ?? normalizeText(name);
}

export async function getArticlesByKeyword(name: string, limit = 30) {
  const keyword = await resolveCanonicalKeywordName(name);
  if (!keyword || !isValidKeywordCandidate(keyword)) {
    return {
      keyword: keyword ?? normalizeText(name),
      total: 0,
      items: [] as Array<{
        id: string;
        title: string;
        slug: string;
        excerpt: string | null;
        publishedAt: Date | null;
        updatedAt: Date;
      }>,
    };
  }

  const where: Prisma.ArticleWhereInput = {
    status: "approved",
    OR: [
      { keywordItems: { some: { keyword } } },
      { manualKeywords: { contains: keyword } },
      { keywords: { contains: keyword } },
    ],
  };

  const [items, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
    prisma.article.count({ where }),
  ]);

  return { keyword, total, items };
}

export function formatKeywordCsv(input: string[]) {
  return normalizeKeywordList(input.join(",")).join(",");
}

