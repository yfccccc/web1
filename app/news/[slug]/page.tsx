import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArticleViewTracker } from "@/components/ArticleViewTracker";
import { ContentHeroImage } from "@/components/ContentHeroImage";
import { JsonLd } from "@/components/JsonLd";
import { NewsArticleJsonLd } from "@/components/NewsArticleJsonLd";
import { isDisplayNewsKeyword } from "@/lib/news-keyword-rules";
import { previewText } from "@/lib/text";
import { RichContent } from "@/components/RichContent";
import { NewsUrlSync } from "./NewsUrlSync";
import { buildPageMetadata } from "@/lib/seo";
import { buildNewsTitle } from "@/lib/seo-title";
import { ArticleShareActions } from "@/components/ArticleShareActions";
import { buildArticleShareVersion, buildNewsPath, buildPublicNewsUrl, getArticleSegment } from "@/lib/share-config";
import { resolveUploadedImageUrl } from "@/lib/uploaded-image";
import { DEFAULT_NEWS_SHARE_IMAGE, findNewsArticleBySegment, normalizeNewsSegment, resolveArticleShareImage } from "@/lib/news-sharing";
import { prisma } from "@/lib/prisma";
import {
  getNewsSubcategory,
  getPublishedNewsSubcategoryPage,
  NEWS_SUBCATEGORIES,
} from "@/lib/news-listing";
import { getRecommendedNews, isValidKeywordCandidate } from "@/lib/news-keywords-v2";
import { resolveArticleSourceType } from "@/lib/article-source";
import { decodeHtmlEntities } from "@/lib/brand-content";
import { NewsPagination } from "@/components/NewsPagination";
import { decodeEscapedUnicode } from "@/lib/text";
import { NEWS_AFTERMARKET_SUBCATEGORY, getNewsAftermarketConfig, parseProductRecommendations } from "@/lib/news-aftermarket";
import {
  findNewsTrendsSummaryArticle,
  getNewsTrendsSummaryRelatedArticles,
  hasNewsTrendsArticleLink,
  hasNewsTrendsSummaryLink,
  isNewsTrendsArticle,
  isNewsTrendsSummaryArticle,
} from "@/lib/news-trends-summary";

export const revalidate = 300;
export const dynamic = "force-dynamic";
const LEGACY_SITE_URL = "https://jiu.cnzhengmu.com";

const NEWS_SECTION_LABELS: Record<string, string> = {
  "/news/trends": "行业趋势",
  "/news/enterprise": "企业动态",
  "/news/tech": "技术发展",
  "/news/events": "行业活动",
  [NEWS_AFTERMARKET_SUBCATEGORY.href]: NEWS_AFTERMARKET_SUBCATEGORY.label,
  "/news": "整木资讯",
};

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function isLegacyNumericNewsId(value: string) {
  return /^\d+$/.test((value || "").trim());
}

function getLegacyNewsRedirectId(value: string) {
  const match = (value || "").trim().match(/^(\d+)(?:-[a-z])?$/i);
  return match?.[1] ?? null;
}

function isCorruptedNewsTitle(title?: string | null) {
  const normalized = decodeEscapedUnicode((title || "").trim());
  if (!normalized) return true;
  if (/\?{3,}/.test(normalized)) return true;
  if (/\uFFFD/.test(normalized)) return true;
  return false;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const subMeta = getNewsSubcategory(slug);
  if (subMeta) {
    return buildPageMetadata({
      title: `${subMeta.title}｜整木行业资讯`,
      description: subMeta.description,
      path: `/news/${slug}`,
      type: "website",
      image: DEFAULT_NEWS_SHARE_IMAGE,
      absoluteTitle: true,
    });
  }

  const legacyId = getLegacyNewsRedirectId(slug);
  if (legacyId) {
    return {
      title: { absolute: "整木行业资讯｜整木网" },
      alternates: { canonical: `${LEGACY_SITE_URL}/index.php?m=news&c=shows&id=${encodeURIComponent(legacyId)}` },
    };
  }

  const article = await findNewsArticleBySegment(slug);
  if (!article || article.status !== "approved" || isCorruptedNewsTitle(article.title)) {
    return { title: { absolute: "资讯不存在｜整木行业资讯" }, robots: { index: false, follow: false } };
  }

  const displayTitle = decodeEscapedUnicode(article.title || "");
  const displayExcerpt = decodeEscapedUnicode(article.excerpt ?? "");
  const displayContent = normalizeNewsArticleContent(article.content);
  const description =
    previewText(displayExcerpt || displayContent, 80) ||
    `${displayTitle.trim()}，整木行业资讯解读`;
  const image = resolveArticleShareImage(article);
  const articleSegment = getArticleSegment(article);

  return buildPageMetadata({
    title: buildNewsTitle(displayTitle),
    description,
    path: buildNewsPath(articleSegment),
    type: "article",
    siteName: "整木网",
    image,
    imageAlt: displayTitle,
    absoluteTitle: true,
  });
}
function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getHeadlineClass(title: string) {
  const length = title.trim().length;

  if (length >= 34) {
    return "max-w-none text-[2.1rem] leading-[1.22] tracking-[-0.016em] [text-wrap:balance] sm:max-w-[26ch] sm:text-[2.1rem]";
  }

  if (length >= 24) {
    return "max-w-none text-[2.22rem] leading-[1.2] tracking-[-0.018em] [text-wrap:balance] sm:max-w-[24ch] sm:text-[2.28rem]";
  }

  return "max-w-none text-[2.36rem] leading-[1.16] tracking-[-0.02em] [text-wrap:balance] sm:max-w-[22ch] sm:text-[2.6rem]";
}

function resolveNewsSectionLabel(subHref?: string | null, categoryHref?: string | null) {
  const href = (subHref || categoryHref || "").trim();
  return NEWS_SECTION_LABELS[href] ?? "整木资讯";
}

function parseKeywordList(keywordSource?: string | null) {
  return Array.from(
    new Set(
      `${keywordSource || ""}`
        .split(/[,\n，、]+/)
        .map((item) => item.trim())
        .filter((item) => isValidKeywordCandidate(item) && isDisplayNewsKeyword(item)),
    ),
  ).slice(0, 5);
}

function parseFaqPairs(input?: string | null) {
  if (!input) return [] as Array<{ q: string; a: string }>;

  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        q: typeof item?.q === "string" ? decodeEscapedUnicode(item.q).trim() : "",
        a: typeof item?.a === "string" ? decodeEscapedUnicode(item.a).trim() : "",
      }))
      .filter((item) => item.q && item.a)
      .slice(0, 6);
  } catch {
    return [];
  }
}

function stripNewsLeadingOverviewHeading(html?: string | null) {
  const source = (html || "").trim();
  if (!source) return "";

  return source.replace(
    /^\s*<(h[1-6]|p)[^>]*>\s*(?:概述|导语|摘要|前言|概况)\s*<\/\1>\s*/i,
    "",
  );
}

const ESCAPED_NEWS_TAG_PATTERN = /&lt;(h1|h2|h3|p|a|img|ul|ol|li)\b/i;

function repairEscapedNewsStructuredHtml(html?: string | null) {
  const source = (html || "").trim();
  if (!source) return "";

  const wrappedMatch = source.match(
    /^\s*<section>\s*<h3>([^<]{1,80})<\/h3>\s*<p>([\s\S]+)<\/p>\s*<\/section>\s*$/i,
  );
  if (!wrappedMatch) return source;

  const escapedInnerHtml = (wrappedMatch[2] || "").trim();
  if (!ESCAPED_NEWS_TAG_PATTERN.test(escapedInnerHtml)) return source;

  const decodedInnerHtml = decodeHtmlEntities(escapedInnerHtml).trim();
  if (!decodedInnerHtml || !/<(h1|h2|h3|p|a|img|ul|ol|li)\b/i.test(decodedInnerHtml)) {
    return source;
  }

  return decodedInnerHtml;
}

function normalizeNewsArticleContent(rawContent?: string | null) {
  return repairEscapedNewsStructuredHtml(decodeEscapedUnicode(rawContent || ""));
}

function normalizeArticleSourceValue(value?: string | null) {
  const normalized = (value || "").trim();
  return normalized.length > 0 ? normalized : "";
}

function isAutoSeoArticleSource(article: { sourceType?: string | null; source?: string | null; sourceUrl?: string | null }) {
  return resolveArticleSourceType(article) === "ai_generated";
}

function buildArticleSourceSummary(article: { sourceType?: string | null; source?: string | null; sourceUrl?: string | null }) {
  if (isAutoSeoArticleSource(article)) return null;
  const sourceName = normalizeArticleSourceValue(article.source);
  const sourceUrl = normalizeArticleSourceValue(article.sourceUrl);
  if (!sourceName && !sourceUrl) return null;

  return {
    sourceName: sourceName || "原始来源",
    sourceUrl,
    description: sourceName
      ? `本文转载自「${sourceName}」，仅用于行业信息交流。`
      : "本文整理自公开信息，仅用于行业信息交流。",
  };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const legacyId = getLegacyNewsRedirectId(slug);
  if (legacyId) {
    permanentRedirect(`${LEGACY_SITE_URL}/index.php?m=news&c=shows&id=${encodeURIComponent(legacyId)}`);
  }

  const subMeta = getNewsSubcategory(slug);
  if (subMeta) {
    const subHref = subMeta.href;
    const siblingLinks = NEWS_SUBCATEGORIES.map((item) => ({
      href: item.href,
      title: item.title,
      active: item.slug === slug,
    }));
    const resolvedSearchParams = await searchParams;
    const requestedPage = Math.max(
      1,
      Number.parseInt(getSearchParamValue(resolvedSearchParams?.page) ?? "1", 10) || 1,
    );
    const listing = await getPublishedNewsSubcategoryPage(subMeta.slug, requestedPage);
    if (!listing) notFound();
    const { items, total, totalPages, page } = listing;

    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <nav className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted" aria-label="面包屑">
          <Link href="/" className="hover:text-accent">首页</Link>
          <span>/</span>
          <Link href="/news" className="hover:text-accent">整木资讯</Link>
          <span>/</span>
          <span className="text-primary">{subMeta.title}</span>
        </nav>

        <section className="glass-panel relative overflow-hidden p-5 sm:p-7 lg:p-9">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,194,158,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(207,221,236,0.18),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(194,182,154,0.58),transparent)]" />
          <div className="relative">
            <div className="max-w-3xl">
              <h1 className="font-serif text-[2rem] font-semibold tracking-[-0.02em] text-primary sm:text-[2.7rem] lg:text-[3.3rem]">
                {subMeta.title}
              </h1>
              <p className="mt-3 max-w-[46rem] text-[15px] leading-8 text-muted sm:mt-4 sm:text-[15px]">
                {subMeta.description}
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#9a8560]">
                  共 {total} 篇已发布资讯
                </div>
                <Link
                  href={`/news/all?sub=${encodeURIComponent(subHref)}&search=1`}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(194,182,154,0.34)] bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(246,240,231,0.94))] px-4 py-3 text-sm font-medium text-primary shadow-[0_16px_34px_-26px_rgba(180,154,107,0.42),inset_0_1px_0_rgba(255,255,255,0.92)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(170,154,122,0.46)] hover:text-accent sm:w-auto sm:px-5 sm:py-2.5"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#9a8256] transition-transform duration-200 group-hover:scale-105" fill="none" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="4.75" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12.2 12.2 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span>搜索本栏目</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="relative mt-6 flex flex-wrap items-center gap-2.5 border-t border-[rgba(194,182,154,0.18)] pt-4 sm:mt-8 sm:pt-5">
            {siblingLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`min-w-[calc(50%-0.3125rem)] justify-center rounded-full border px-3.5 py-2 text-sm transition-colors sm:min-w-0 sm:justify-start sm:px-3.5 sm:py-1.5 ${
                  item.active
                    ? "border-[rgba(180,154,107,0.42)] bg-[linear-gradient(180deg,rgba(255,252,246,0.96),rgba(246,240,231,0.94))] text-[#8a734d] shadow-[0_10px_22px_rgba(180,154,107,0.12)]"
                    : "border-border bg-white/72 text-muted hover:text-primary"
                }`}
              >
                {item.title}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-border bg-[rgba(255,255,255,0.82)] p-5 sm:p-6">
          {items.length === 0 ? (
            <p className="text-sm text-muted">当前栏目还没有已发布内容。</p>
          ) : (
            <ul className="grid gap-4">
              {items.map((item) => (
                <li key={item.id} className="rounded-[22px] border border-border bg-surface-elevated p-4 sm:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-muted">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[rgba(180,154,107,0.86)]" />
                      <span>{subMeta.title}</span>
                    </div>
                    <span className="text-xs text-muted">
                      {(item.publishedAt ?? item.updatedAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <Link href={buildNewsPath(getArticleSegment(item))} className="mt-2 block text-[1rem] font-medium leading-8 text-primary hover:text-accent sm:mt-3 sm:text-[1.1rem]">
                    {decodeEscapedUnicode(item.title)}
                  </Link>
                  {item.excerpt ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-7 text-muted sm:mt-3">
                      {decodeEscapedUnicode(item.excerpt)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <NewsPagination baseHref={subHref} page={page} totalPages={totalPages} />
        </section>
      </div>
    );
  }

  const article = await findNewsArticleBySegment(slug);
  if (!article || article.status !== "approved" || isCorruptedNewsTitle(article.title)) {
    notFound();
  }

  const displayTitle = decodeEscapedUnicode(article.title);
  const displayExcerpt = decodeEscapedUnicode(article.excerpt ?? "");
  const displayConceptSummary = decodeEscapedUnicode(article.conceptSummary ?? "");
  const displayAuthor = decodeEscapedUnicode(article.displayAuthor ?? "");
  const displaySource = decodeEscapedUnicode(article.source ?? "");
  const displayContent = normalizeNewsArticleContent(article.content);

  const articleSegment = getArticleSegment(article);
  const currentSegment = normalizeNewsSegment(slug);
  if (currentSegment !== articleSegment) {
    const target = new URL(buildNewsPath(articleSegment), "https://dummy.local");
    permanentRedirect(`${target.pathname}${target.search}`);
  }

  const articleUrl = buildPublicNewsUrl(articleSegment);
  const shareVersion = buildArticleShareVersion(article.updatedAt ?? article.publishedAt ?? article.id);
  const publicBaseUrl = articleUrl.replace(/\/news\/.*$/, "");
  const articleShareImage = resolveArticleShareImage(article);
  const articleSection = resolveNewsSectionLabel(article.subHref, article.categoryHref);
  const keywords = parseKeywordList(article.manualKeywords?.trim() || article.keywords);
  const faqPairs = parseFaqPairs(article.faqPairsJson ?? article.faqJson);
  const recommendedArticles = await getRecommendedNews(article.id, 4);
  const sourceSummary = buildArticleSourceSummary(article);
  const aftermarketConfig = await getNewsAftermarketConfig();
  const productRecommendations = parseProductRecommendations(article.productRecommendations).slice(
    0,
    aftermarketConfig.detailRecommendCount,
  );
  const isTrendsArticle = isNewsTrendsArticle(article);
  const isTrendsSummaryPage = isNewsTrendsSummaryArticle(article);
  const trendsSummaryArticle = isTrendsSummaryPage
    ? {
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt,
      }
    : isTrendsArticle
      ? await findNewsTrendsSummaryArticle()
      : null;
  const trendsSummaryPath = trendsSummaryArticle?.slug ? buildNewsPath(trendsSummaryArticle.slug) : null;
  const relatedTrendArticles = isTrendsSummaryPage && trendsSummaryArticle
    ? (await getNewsTrendsSummaryRelatedArticles(trendsSummaryArticle, 50)).filter(
        (item) => !hasNewsTrendsArticleLink(displayContent, item.slug)
      )
    : [];
  const shouldShowTrendsSummarySection = isTrendsSummaryPage;
  const shouldShowTrendsSummaryBackLink =
    isTrendsArticle &&
    !isTrendsSummaryPage &&
    trendsSummaryArticle?.slug &&
    !hasNewsTrendsSummaryLink(displayContent, trendsSummaryArticle.slug);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${articleUrl}#article`,
    headline: displayTitle,
    description: previewText(displayExcerpt || displayContent, 200),
    author: displayAuthor ? [{ "@type": "Person", name: displayAuthor }] : undefined,
    datePublished: article.publishedAt ?? article.updatedAt,
    dateModified: article.updatedAt,
    inLanguage: "zh-CN",
    url: articleUrl,
    mainEntityOfPage: articleUrl,
    publisher: { "@id": `${publicBaseUrl}/#organization` },
    articleSection,
    keywords: keywords.length > 0 ? keywords.join(", ") : undefined,
    about: keywords.length > 0 ? keywords.map((name) => ({ "@type": "Thing", name })) : undefined,
    thumbnailUrl: articleShareImage.startsWith("http") ? articleShareImage : `${publicBaseUrl}${articleShareImage}`,
    isAccessibleForFree: true,
    image: [
      {
        "@type": "ImageObject",
        url: articleShareImage.startsWith("http") ? articleShareImage : `${publicBaseUrl}${articleShareImage}`,
        caption: displayTitle,
        representativeOfPage: true,
      },
    ],
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: publicBaseUrl },
      { "@type": "ListItem", position: 2, name: "整木资讯", item: `${publicBaseUrl}/news` },
      { "@type": "ListItem", position: 3, name: displayTitle, item: articleUrl },
    ],
  };

  const faqSchema =
    faqPairs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqPairs.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.a,
            },
          })),
        }
      : null;

  return (
    <article id="news-reading-article" className="mx-auto max-w-6xl px-4 pb-6 pt-2 sm:px-6 sm:py-12">
      <NewsUrlSync canonicalPath={buildNewsPath(articleSegment)} />
      <ArticleViewTracker articleId={article.id} />
      <NewsArticleJsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />
      {faqSchema ? <JsonLd data={faqSchema} /> : null}

      <div className="mx-auto max-w-[860px]">
        <nav className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 px-1 text-[15px] text-primary/52 sm:mb-6 sm:px-0 sm:text-[15px] sm:text-primary/52" aria-label="面包屑">
          <Link href="/" className="hover:text-accent">首页</Link>
          <span>/</span>
          <Link href="/news" className="hover:text-accent">整木资讯</Link>
          <span className="hidden sm:inline">/</span>
          <span className="hidden max-w-[36rem] truncate font-medium text-primary/78 sm:inline">{displayTitle}</span>
        </nav>

        <header className="px-1 sm:px-0">
          <h1 className={`${getHeadlineClass(displayTitle)} max-w-[10.5em] font-serif font-semibold text-primary sm:max-w-none`}>
            {displayTitle}
          </h1>

          {displayConceptSummary ? (
            <p className="mt-5 max-w-[42rem] text-[15px] leading-7 text-muted sm:text-base">
              {displayConceptSummary}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-0.5 text-[14px] text-primary/50 sm:mt-5 sm:px-0 sm:text-[14px] sm:text-primary/50">
            <span>发布时间：{new Date(article.publishedAt ?? article.updatedAt).toLocaleDateString("zh-CN")}</span>
            {displayAuthor ? <span>作者：{displayAuthor}</span> : null}
            {displaySource && !isAutoSeoArticleSource(article) ? (
              article.sourceUrl ? (
                <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="transition-colors hover:text-accent">
                  来源：{displaySource}
                </a>
              ) : (
                <span>来源：{displaySource}</span>
              )
            ) : null}
            {article.versionLabel ? <span>版本：{article.versionLabel}</span> : null}
          </div>
        </header>

        <div className="mt-9">
          <div className="overflow-hidden rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.94)] p-3 shadow-[0_24px_52px_-40px_rgba(15,23,42,0.16)] sm:rounded-[30px] sm:p-4 sm:shadow-[0_28px_58px_-42px_rgba(15,23,42,0.16)]">
            <ContentHeroImage
              src={article.coverImage}
              alt={displayTitle}
              adaptiveOnMobile
              containerClassName="aspect-[16/9] rounded-[24px] border-0 bg-transparent p-0 sm:rounded-[26px]"
              imageClassName="rounded-[24px] object-cover object-[center_42%] p-0 sm:rounded-[26px]"
            />
          </div>
        </div>

        {displayExcerpt ? (
          <blockquote className="mt-10 border-l-[3px] border-l-[rgba(221,226,232,0.96)] pl-5 pr-1 text-[15px] leading-8 text-muted sm:mt-8 sm:pl-6">
            {displayExcerpt}
          </blockquote>
        ) : null}

        <div className="mt-8 rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.94)] px-5 py-7 shadow-[0_22px_44px_-38px_rgba(15,23,42,0.12)] sm:rounded-[26px] sm:px-8 sm:py-9 sm:shadow-[0_24px_48px_-40px_rgba(15,23,42,0.12)]">
          <RichContent html={stripNewsLeadingOverviewHeading(displayContent)} className="prose prose-neutral article-reading-rich-content max-w-none" />
          {shouldShowTrendsSummarySection ? (
            <div className="mt-8 border-t border-[rgba(15,23,42,0.08)] pt-6">
              <h2 className="text-lg font-semibold text-primary sm:text-xl">更多整木行业趋势观察</h2>
              {relatedTrendArticles.length > 0 ? (
                <ul className="mt-4 space-y-3 text-sm leading-7 text-primary sm:text-[15px]">
                  {relatedTrendArticles.map((item) => (
                    <li key={item.id}>
                      <a
                        href={buildNewsPath(item.slug)}
                        className="font-medium text-[#ab8a5e] underline decoration-[rgba(171,138,94,0.42)] underline-offset-4 transition-colors hover:text-[#8b6d45]"
                      >
                        {decodeEscapedUnicode(item.title)}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-7 text-muted sm:text-[15px]">
                  后续发布的整木行业趋势文章，将自动汇总在这里。
                </p>
              )}
            </div>
          ) : null}
          {shouldShowTrendsSummaryBackLink && trendsSummaryPath ? (
            <div className="mt-8 border-t border-[rgba(15,23,42,0.08)] pt-6 text-sm leading-7 text-muted sm:text-[15px]">
              更多整木行业趋势观察，可以查看：
              <a
                href={trendsSummaryPath}
                className="ml-1 font-medium text-[#ab8a5e] underline decoration-[rgba(171,138,94,0.42)] underline-offset-4 transition-colors hover:text-[#8b6d45]"
              >
                整木行业趋势专题汇总
              </a>
            </div>
          ) : null}
          {sourceSummary ? (
            <section className="mt-10 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[#f6f7f9] px-5 py-4 text-[14px] leading-7 text-[#666] sm:px-6">
              <h2 className="text-[15px] font-semibold text-[#333]">信息来源</h2>
              <p className="mt-2">{sourceSummary.description}</p>
              {sourceSummary.sourceUrl ? (
                <p className="mt-2">
                  原文链接：
                  <a
                    href={sourceSummary.sourceUrl}
                    target="_blank"
                    rel="nofollow noreferrer"
                    className="ml-1 text-[#1677ff] transition-colors hover:underline"
                  >
                    点击查看原文
                  </a>
                </p>
              ) : null}
              <p className="mt-2 text-[13px] text-[#7a7a7a]">如涉及版权问题，请联系删除。</p>
            </section>
          ) : null}
          <div className="mt-5 pt-1 sm:mt-6 sm:pt-2">
            <ArticleShareActions
              title={displayTitle}
              shareUrl={articleUrl}
              siteName="整木网"
              className="mt-0"
            />
          </div>
        </div>

        {keywords.length > 0 ? (
          <section className="mt-10 rounded-[24px] border border-border bg-surface-elevated px-5 py-6 sm:px-7">
            <h2 className="mb-4 text-lg font-semibold text-primary">核心关键词</h2>
            <div className="flex flex-wrap gap-2.5">
              {keywords.map((keyword) => (
                <Link
                  key={keyword}
                  href={`/keyword/${encodeURIComponent(keyword)}`}
                  className="inline-flex items-center rounded-full border border-[rgba(194,182,154,0.32)] bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(246,240,231,0.94))] px-3.5 py-1.5 text-sm text-[#7b6542] transition hover:border-[rgba(180,154,107,0.48)] hover:text-accent"
                >
                  {keyword}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {productRecommendations.length > 0 ? (
          <section className="mt-10 rounded-[24px] border border-[rgba(194,182,154,0.28)] bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(246,240,231,0.92))] px-5 py-6 text-[#1f2937] shadow-[0_18px_40px_-34px_rgba(180,154,107,0.28)] sm:px-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#111827]">相关产品推荐</h2>
                <p className="mt-1 text-sm leading-7 text-[#4b5563]">文章已关联木作清洁养护商品，可继续前往商城或商品详情页了解。</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {productRecommendations.map((item) => (
                <a
                  key={`${item.title}-${item.url}`}
                  href={item.url}
                  target={item.url.startsWith("http") ? "_blank" : undefined}
                  rel={item.url.startsWith("http") ? "noreferrer" : undefined}
                  className="rounded-[20px] border border-[rgba(194,182,154,0.26)] bg-white/88 p-4 text-[#1f2937] transition hover:-translate-y-0.5 hover:border-[rgba(170,154,122,0.42)]"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveUploadedImageUrl(item.imageUrl)}
                      alt={item.title}
                      className="h-40 w-full rounded-[16px] object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-[16px] bg-[rgba(250,245,237,0.92)] text-sm text-[#5b6472]">
                      木作护理推荐
                    </div>
                  )}
                  <h3 className="mt-4 text-base font-semibold leading-7 text-[#111827]">{item.title}</h3>
                  {item.sellingPoint ? <p className="mt-2 text-sm leading-7 text-[#374151]">{item.sellingPoint}</p> : null}
                  <span className="mt-4 inline-flex items-center rounded-full border border-[rgba(180,154,107,0.34)] px-4 py-2 text-sm font-medium text-[#7b6542]">
                    去商城
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {recommendedArticles.length > 0 ? (
          <section className="mt-10 rounded-[20px] bg-[#fafafa] px-4 py-4 text-[#1f2937] sm:px-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-[#111827]">相关文章</h2>
              <Link href="/news/all" className="text-sm text-[#4b5563] hover:text-accent">
                查看更多
              </Link>
            </div>
            <div className="divide-y divide-[rgba(15,23,42,0.08)]">
              {recommendedArticles.slice(0, 4).map((item) => (
                <Link
                  key={item.id}
                  href={buildNewsPath(getArticleSegment(item))}
                  className="flex items-start gap-3 rounded-xl px-2 py-3 text-sm leading-7 text-[#1f2937] transition hover:bg-white hover:text-accent"
                >
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[rgba(180,154,107,0.86)]" />
                  <span className="flex-1">{decodeEscapedUnicode(item.title)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}


