import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentHeroImage } from "@/components/ContentHeroImage";
import { prisma } from "@/lib/prisma";
import { articleOrderByPinnedLatest, articleOrderByPinnedPopular } from "@/lib/articles";
import { getTermBySlug } from "@/lib/terms";
import { previewText } from "@/lib/text";
import { DefinitionBlock } from "@/components/DefinitionBlock";
import { JsonLd } from "@/components/JsonLd";
import { RichContent } from "@/components/RichContent";
import { ArticleShareActions } from "@/components/ArticleShareActions";
import { getSiteVisualSettings } from "@/lib/site-visual-settings";
import { buildPageMetadata, getSiteUrl } from "@/lib/seo";
import { composeIntentTitle } from "@/lib/compose-intent-title";
import { buildPublicDictionaryUrl, DEFAULT_DICTIONARY_SHARE_IMAGE } from "@/lib/share-config";
import { resolveUploadedImageUrl } from "@/lib/uploaded-image";
import { parseDictionaryContentWithHeadings } from "@/lib/dictionary-content";
import {
  parseDocumentMetadata,
  splitCommaLikeList,
} from "@/lib/document-metadata";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

const DICTIONARY_SUBCATEGORY_MAP: Record<string, { href: string; label: string }> = {
  concepts: { href: "/dictionary/concepts", label: "基础概念" },
  terms: { href: "/dictionary/terms", label: "技术术语" },
  segments: { href: "/dictionary/segments", label: "行业细分" },
  "brand-baike": { href: "/dictionary/brand-baike", label: "品牌百科" },
  "high-end-life": { href: "/dictionary/high-end-life", label: "高定生活" },
};

function normalizeSegment(raw: string) {
  let v = (raw || "").trim();
  for (let i = 0; i < 2; i += 1) {
    try {
      const d = decodeURIComponent(v);
      if (d === v) break;
      v = d;
    } catch {
      break;
    }
  }
  return v.trim();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = normalizeSegment(slug);
  const fallbackShareImage = DEFAULT_DICTIONARY_SHARE_IMAGE;
  if (DICTIONARY_SUBCATEGORY_MAP[s]) {
    const sub = DICTIONARY_SUBCATEGORY_MAP[s];
    return buildPageMetadata({
      title: composeIntentTitle({
        keyword: sub.label,
        suffix: "是什么意思？整木词库专业解析｜整木网",
      }),
      description: `整木词库子栏目：${sub.label}。`,
      path: sub.href,
      type: "website",
      image: fallbackShareImage,
      imageAlt: sub.label,
      absoluteTitle: true,
    });
  }
  const article = await prisma.article.findFirst({
    where: {
      status: "approved",
      slug: s,
      OR: [{ categoryHref: { startsWith: "/dictionary" } }, { subHref: { startsWith: "/dictionary" } }],
    },
    select: { title: true, slug: true, excerpt: true, content: true, faqJson: true, coverImage: true },
  });

  if (article) {
    const metadata = parseDocumentMetadata(article.faqJson);
    const description = metadata.seoDescription || previewText(metadata.intro || (article.excerpt ?? article.content), 160);
    const shareImage = resolveUploadedImageUrl(article.coverImage) || fallbackShareImage;
    return buildPageMetadata({
      title: composeIntentTitle({
        keyword: metadata.seoTitle || article.title,
        suffix: "是什么意思？整木行业专业解析｜整木网",
      }),
      description,
      path: `/dictionary/${article.slug}`,
      type: "article",
      image: shareImage,
      imageAlt: article.title,
      absoluteTitle: true,
    });
  }

  const term = await getTermBySlug(s);
  if (!term) return { title: { absolute: "整木词条不存在｜整木网" } };
  const description = previewText(term.definition, 160);
  return buildPageMetadata({
    title: composeIntentTitle({
      keyword: term.title,
      suffix: "是什么意思？整木行业专业解析｜整木网",
    }),
    description,
    path: `/dictionary/${term.slug}`,
    type: "article",
    image: fallbackShareImage,
    imageAlt: term.title,
    absoluteTitle: true,
  });
}

export default async function TermPage({ params }: Props) {
  const { slug } = await params;
  const s = normalizeSegment(slug);
  const subcategory = DICTIONARY_SUBCATEGORY_MAP[s];
  const visualSettings = await getSiteVisualSettings();

  if (subcategory) {
    const [hotTerms, latestTerms] = await Promise.all([
      prisma.article.findMany({
        where: {
          status: "approved",
          OR: [{ subHref: subcategory.href }, { categoryHref: subcategory.href }],
        },
        orderBy: articleOrderByPinnedPopular,
        take: 10,
        select: { id: true, title: true, slug: true },
      }),
      prisma.article.findMany({
        where: {
          status: "approved",
          OR: [{ subHref: subcategory.href }, { categoryHref: subcategory.href }],
        },
        orderBy: articleOrderByPinnedLatest,
        take: 3,
        select: { id: true, title: true, slug: true, updatedAt: true },
      }),
    ]);

    return (
      <article className="max-w-5xl mx-auto px-4 py-10">
        <nav className="mb-6 text-sm text-muted" aria-label="面包屑">
          <Link href="/" className="hover:text-accent">首页</Link>
          <span className="mx-2">/</span>
          <Link href="/dictionary" className="hover:text-accent">整木词库</Link>
          <span className="mx-2">/</span>
          <span className="text-primary">{subcategory.label}</span>
        </nav>

        <section className="glass-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-primary">{subcategory.label}</h1>
            <Link
              href="/membership/content/publish?tab=terms"
              className="interactive-lift rounded-lg bg-[var(--color-accent)] text-white px-4 py-2 text-sm font-medium hover:brightness-105"
            >
              创建词库
            </Link>
          </div>

          <form action="/dictionary/all" method="get" className="mt-4 rounded-xl border border-border bg-surface-elevated p-4 flex flex-col sm:flex-row gap-3">
            <input type="hidden" name="sub" value={subcategory.href} />
            <input
              name="q"
              className="flex-1 border border-border rounded px-3 py-2 bg-surface"
              placeholder={`搜索${subcategory.label}词条`}
            />
            <button className="px-4 py-2 rounded bg-accent text-white text-sm">搜索</button>
          </form>

          <h2 className="section-label text-primary mt-6">热搜词库</h2>
          {hotTerms.length === 0 ? (
            <p className="mt-3 text-sm text-muted">暂无热搜词条。</p>
          ) : (
            <ul className="mt-3 grid sm:grid-cols-2 gap-2">
              {hotTerms.map((item, idx) => (
                <li key={item.id}>
                  <Link href={`/dictionary/${item.slug}`} className="block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary hover:border-accent/45 hover:text-accent">
                    <span className="mr-2 text-accent font-semibold">{idx + 1}.</span>
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="section-label text-primary mt-6">最新发布</h2>
          {latestTerms.length === 0 ? (
            <p className="mt-3 text-sm text-muted">暂无词库内容。</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {latestTerms.map((item) => (
                <li key={item.id} className="border-b border-border pb-3">
                  <Link href={`/dictionary/${item.slug}`} className="text-sm text-primary hover:text-accent">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted">更新于 {item.updatedAt.toLocaleDateString("zh-CN")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    );
  }

  const article = await prisma.article.findFirst({
    where: {
      status: "approved",
      slug: s,
      OR: [{ categoryHref: { startsWith: "/dictionary" } }, { subHref: { startsWith: "/dictionary" } }],
    },
  });

  if (article) {
    const metadata = parseDocumentMetadata(article.faqJson);
    const { htmlWithHeadingIds, headings } = parseDictionaryContentWithHeadings(article.content ?? "");
    const tagSlugs = splitCommaLikeList(article.tagSlugs);
    const relatedItems = await prisma.article.findMany({
      where: {
        id: { not: article.id },
        status: "approved",
        OR: [{ categoryHref: { startsWith: "/dictionary" } }, { subHref: { startsWith: "/dictionary" } }],
        ...(tagSlugs.length > 0
          ? {
              AND: [{
                OR: tagSlugs.slice(0, 4).map((tag) => ({
                tagSlugs: { contains: tag },
                })),
              }],
            }
          : {}),
      },
      take: 6,
      select: { id: true, title: true, slug: true, excerpt: true, updatedAt: true },
    }).catch(() => []);

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: article.title,
      description: previewText(metadata.intro || (article.excerpt ?? article.content), 200),
      dateModified: article.updatedAt,
    };

    const baseUrl = getSiteUrl();
    const termUrl = `${baseUrl}/dictionary/${article.slug}`;
    const shareUrl = buildPublicDictionaryUrl(article.slug);
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: baseUrl },
        { "@type": "ListItem", position: 2, name: "整木词库", item: `${baseUrl}/dictionary` },
        { "@type": "ListItem", position: 3, name: article.title, item: termUrl },
      ],
    };

    return (
      <article className="max-w-6xl mx-auto px-4 py-10">
        <JsonLd data={jsonLd} />
        <JsonLd data={breadcrumbSchema} />
        <header className="glass-panel p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Whole Wood Wiki</p>
          <h1 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold text-primary">{article.title}</h1>
          <p className="mt-3 max-w-3xl text-sm sm:text-base leading-7 text-muted">
            {metadata.intro || article.excerpt || "用于沉淀整木行业术语、概念与关联知识的词条文档。"}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full border border-border px-3 py-1">更新于 {article.updatedAt.toLocaleDateString("zh-CN")}</span>
            {tagSlugs.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full border border-border px-3 py-1">{tag}</span>
            ))}
          </div>
        </header>

        <ContentHeroImage src={article.coverImage} alt={article.title} />

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-surface-elevated p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">词条简介</h2>
              <div className="mt-4">
                <DefinitionBlock definition={metadata.intro || article.excerpt || previewText(article.content, 140)} />
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-surface-elevated p-6">
              <RichContent html={htmlWithHeadingIds} className="prose prose-neutral dark:prose-invert max-w-none" />
              <ArticleShareActions
                title={article.title}
                shareUrl={shareUrl}
                siteName="整木词库"
                className="mt-6"
              />
            </section>

            {relatedItems.length > 0 && (
              <section className="rounded-3xl border border-border bg-surface-elevated p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-primary">相关词条</h2>
                  <Link href="/dictionary/all" className="apple-inline-link">查看全部</Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {relatedItems.map((item) => (
                    <Link key={item.id} href={`/dictionary/${item.slug}`} className="rounded-2xl border border-border bg-surface p-4 hover:border-accent/40">
                      <p className="text-sm font-medium text-primary">{item.title}</p>
                      <p className="mt-2 text-xs leading-6 text-muted line-clamp-2">
                        {item.excerpt || "查看该词条的定义、应用与延伸知识。"}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {headings.length > 0 && (
              <section className="rounded-3xl border border-border bg-surface-elevated p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">目录</h2>
                <nav className="mt-4 space-y-2">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className={`block text-sm text-primary hover:text-accent ${heading.level === 3 ? "pl-4" : heading.level === 2 ? "pl-2" : ""}`}
                    >
                      {heading.text}
                    </a>
                  ))}
                </nav>
              </section>
            )}

            <section className="rounded-3xl border border-border bg-surface-elevated p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">参与共建</h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                词条支持用户投稿、补充建议与管理员审核发布，持续沉淀站内整木知识体系。
              </p>
              <Link
                href={`/dictionary/edit/${article.id}`}
                className="mt-4 inline-flex rounded-full border border-border px-4 py-2 text-sm text-primary hover:border-accent/40 hover:text-accent"
              >
                提出修改
              </Link>
            </section>
          </aside>
        </div>
      </article>
    );
  }

  const term = await getTermBySlug(s);
  if (!term) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: term.title,
    description: previewText(term.definition, 200),
    dateModified: term.updatedAt,
  };

  const baseUrl = getSiteUrl();
  const termUrl = `${baseUrl}/dictionary/${term.slug}`;
  const shareUrl = buildPublicDictionaryUrl(term.slug);
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "整木词库", item: `${baseUrl}/dictionary` },
      { "@type": "ListItem", position: 3, name: term.title, item: termUrl },
    ],
  };

  return (
    <article className="max-w-3xl mx-auto px-4 py-10">
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbSchema} />
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{term.title}</h1>
      <ContentHeroImage fallbackSrc={visualSettings.backgrounds.dictionaryArticleHero} alt={term.title} />
      <DefinitionBlock definition={term.definition} />
      <ArticleShareActions
        title={term.title}
        shareUrl={shareUrl}
        siteName="整木词库"
        className="mt-0"
      />

      {term.background && (
        <section className="mt-8">
          <h2 className="font-serif text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">发展背景</h2>
          <p className="text-[var(--color-muted)] whitespace-pre-wrap">{term.background}</p>
        </section>
      )}
      {term.features && (
        <section className="mt-8">
          <h2 className="font-serif text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">核心特征</h2>
          <p className="text-[var(--color-muted)] whitespace-pre-wrap">{term.features}</p>
        </section>
      )}
      {term.structure && (
        <section className="mt-8">
          <h2 className="font-serif text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">技术结构</h2>
          <p className="text-[var(--color-muted)] whitespace-pre-wrap">{term.structure}</p>
        </section>
      )}
      {term.significance && (
        <section className="mt-8">
          <h2 className="font-serif text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">行业意义</h2>
          <p className="text-[var(--color-muted)] whitespace-pre-wrap">{term.significance}</p>
        </section>
      )}

      <footer className="mt-10 pt-4 text-xs text-[var(--color-muted)]">
        版本 {term.version ?? "—"} · 更新于 {term.updatedAt.toLocaleDateString("zh-CN")}
      </footer>
    </article>
  );
}





