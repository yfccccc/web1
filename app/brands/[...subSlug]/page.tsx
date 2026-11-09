import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { buildPageMetadata } from "@/lib/seo";
import { composeIntentTitle } from "@/lib/compose-intent-title";
import { RichContent } from "@/components/RichContent";
import { getBrandDirectoryBySlug } from "@/lib/brand-directory";
import { buildBrandPublicUrl, getLegacyBrandEnterpriseId, safeDecodeUrlSegment } from "@/lib/brand-public-url";
import { parseBrandStructuredHtml } from "@/lib/brand-structured";
import { previewText } from "@/lib/text";
import { resolveUploadedImageUrl } from "@/lib/uploaded-image";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ subSlug: string[] }>;
};

const MARKET_TITLE = "整木市场";
const LEGACY_MARKET_TITLE = "整木品牌";

function normalizeMarketTitle(input?: string | null) {
  const value = input?.trim();
  if (!value || value === LEGACY_MARKET_TITLE) return MARKET_TITLE;
  return value;
}

function normalizeSegment(raw: string) {
  return safeDecodeUrlSegment(raw);
}

async function findBrandBySegment(segment: string) {
  const s = normalizeSegment(segment);
  return getBrandDirectoryBySlug(s);
}

async function findEnterpriseBySegment(segment: string) {
  const s = normalizeSegment(segment);
  if (!s) return null;

  return prisma.enterprise.findFirst({
    where: {
      OR: [
        { companyShortName: { equals: s, mode: "insensitive" } },
        { companyName: { equals: s, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      companyName: true,
      companyShortName: true,
    },
  });
}

async function findBrandArticleBySegment(segment: string) {
  const s = normalizeSegment(segment);
  if (!s) return null;

  return prisma.article.findFirst({
    where: {
      status: "approved",
      OR: [{ categoryHref: { startsWith: "/brands/brand" } }, { subHref: { startsWith: "/brands/brand" } }],
      AND: [
        {
          OR: [
            { slug: { equals: s, mode: "insensitive" } },
            { title: { equals: s, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      coverImage: true,
      source: true,
      sourceUrl: true,
      displayAuthor: true,
      tagSlugs: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subSlug } = await params;
  if (!subSlug || subSlug.length !== 1) return { title: { absolute: "整木品牌专区｜整木网" } };

  const segment = normalizeSegment(subSlug[0]);
  if (segment === "all") return { title: { absolute: "整木品牌大全_整木定制品牌怎么选_厂家汇总｜整木网" } };

  if (segment === "brand") {
    return buildPageMetadata({
      title: "整木品牌专区_整木定制品牌筛选指南｜整木网",
      description: "整木品牌子栏目，支持品牌浏览与对比。",
      path: "/brands/all",
      absoluteTitle: true,
    });
  }

  if (segment === "buying" || segment === "faq") {
    return buildPageMetadata({
      title: "整木定制怎么选？预算、品牌、避坑全指南｜整木网",
      description: "系统梳理整木定制选购中的关键问题，帮助用户更快完成品牌筛选与咨询决策。",
      path: "/brands/buying",
      absoluteTitle: true,
    });
  }

  const brand = await findBrandBySegment(segment);
  if (brand) {
    return buildPageMetadata({
      title: composeIntentTitle({
        keyword: brand.enterpriseName,
        suffix: "怎么样？整木定制品牌口碑与产品解析｜整木网",
      }),
      description: brand.summary,
      path: brand.publicUrl,
      absoluteTitle: true,
    });
  }

  const enterprise = await findEnterpriseBySegment(segment);
  if (enterprise) {
    const enterpriseName = enterprise.companyShortName || enterprise.companyName || "企业";
    return buildPageMetadata({
      title: composeIntentTitle({
        keyword: enterpriseName,
        suffix: "怎么样？整木定制品牌口碑与产品解析｜整木网",
      }),
      description: "该品牌已关联企业资料，可查看企业详情、联系方式和展示内容。",
      path: buildBrandPublicUrl({ slug: segment, enterpriseId: enterprise.id }),
      absoluteTitle: true,
    });
  }

  const article = await findBrandArticleBySegment(segment);
  if (!article) return { title: { absolute: "整木品牌内容解析｜整木网" } };

  return buildPageMetadata({
    title: composeIntentTitle({
      keyword: article.title,
      suffix: "｜整木品牌口碑解析｜整木网",
    }),
    description: previewText(article.excerpt ?? article.content, 160),
    path: buildBrandPublicUrl({ slug: article.slug }),
    type: "article",
    image: article.coverImage ? resolveUploadedImageUrl(article.coverImage) : undefined,
    imageAlt: article.title,
    absoluteTitle: true,
  });
}

export default async function BrandDetailPage({ params }: Props) {
  const { subSlug } = await params;
  if (!subSlug || subSlug.length !== 1) notFound();

  const segment = normalizeSegment(subSlug[0]);
  if (segment === "all") {
    redirect("/brands/all");
  }

  if (segment === "brand") {
    redirect("/brands/all");
  }

  if (segment === "buying" || segment === "faq") {
    redirect("/brands/buying");
  }

  const legacyEnterpriseId = getLegacyBrandEnterpriseId(segment);
  if (legacyEnterpriseId) {
    permanentRedirect(buildBrandPublicUrl({ slug: segment, enterpriseId: legacyEnterpriseId }));
  }

  const brand = await findBrandBySegment(segment);
  if (brand?.enterprise) {
    permanentRedirect(brand.publicUrl);
  }
  if (brand) {
    notFound();
  }

  const enterprise = await findEnterpriseBySegment(segment);
  if (enterprise) {
    permanentRedirect(buildBrandPublicUrl({ slug: segment, enterpriseId: enterprise.id }));
  }

  const article = await findBrandArticleBySegment(segment);
  if (!article) notFound();

  if (segment !== article.slug) {
    permanentRedirect(buildBrandPublicUrl({ slug: article.slug }));
  }

  const structured = parseBrandStructuredHtml(article.content);
  const keywords = Array.from(
    new Set(
      [article.title, ...(article.tagSlugs || "").split(",")]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);

  return (
    <article className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted" aria-label="面包屑">
        <Link href="/" className="hover:text-accent">首页</Link>
        <span>/</span>
        <Link href="/brands" className="hover:text-accent">{MARKET_TITLE}</Link>
        <span>/</span>
        <span className="text-primary">{article.title}</span>
      </nav>

      <header className="rounded-[30px] border border-[rgba(181,157,121,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,242,235,0.92))] px-6 py-7 shadow-[0_18px_48px_rgba(15,23,42,0.06)] sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-[#9a8560]">
          <span>品牌内容</span>
          {structured?.serviceAreas ? <span>{structured.serviceAreas}</span> : null}
          {structured?.headquarters ? <span>{structured.headquarters}</span> : null}
        </div>
        <h1 className="mt-4 font-serif text-[2.1rem] leading-[1.18] text-primary sm:text-[2.8rem]">{article.title}</h1>
        {article.excerpt ? <p className="mt-4 max-w-3xl text-[15px] leading-8 text-muted sm:text-base">{article.excerpt}</p> : null}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-primary/56">
          <span>{new Date(article.publishedAt ?? article.updatedAt).toLocaleDateString("zh-CN")}</span>
          {article.displayAuthor ? <span>作者：{article.displayAuthor}</span> : null}
          {article.source ? (
            article.sourceUrl ? (
              <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="transition-colors hover:text-accent">
                来源：{article.source}
              </a>
            ) : (
              <span>来源：{article.source}</span>
            )
          ) : null}
        </div>
        {keywords.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <span key={keyword} className="rounded-full border border-[rgba(181,157,121,0.18)] bg-[rgba(255,249,238,0.92)] px-3 py-1 text-xs text-accent">
                {keyword}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {article.coverImage ? (
        <div className="mt-8 overflow-hidden rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-3 shadow-[0_24px_52px_-40px_rgba(15,23,42,0.16)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolveUploadedImageUrl(article.coverImage)} alt={article.title} className="aspect-[16/9] w-full rounded-[22px] object-cover" />
        </div>
      ) : null}

      {structured ? (
        <section className="mt-8 rounded-[28px] border border-border bg-[rgba(255,255,255,0.92)] px-6 py-7 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.16)] sm:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {structured.foundedYear ? <InfoCard label="成立时间" value={structured.foundedYear} /> : null}
            {structured.headquarters ? <InfoCard label="总部地区" value={structured.headquarters} /> : null}
            {structured.serviceAreas ? <InfoCard label="服务区域" value={structured.serviceAreas} /> : null}
            {structured.mainProducts ? <InfoCard label="主营品类" value={structured.mainProducts} /> : null}
          </div>
          {(structured.slogan || structured.website || structured.contactPhone) ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
              {structured.slogan ? (
                <div className="rounded-[22px] border border-border bg-surface p-5">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">品牌主张</p>
                  <p className="mt-3 text-sm leading-7 text-primary">{structured.slogan}</p>
                </div>
              ) : null}
              {(structured.website || structured.contactPhone) ? (
                <div className="rounded-[22px] border border-border bg-surface p-5">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">联系信息</p>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-primary">
                    {structured.website ? <p>官网：{structured.website}</p> : null}
                    {structured.contactPhone ? <p>电话：{structured.contactPhone}</p> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8 rounded-[28px] border border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.94)] px-6 py-7 shadow-[0_22px_44px_-38px_rgba(15,23,42,0.12)] sm:px-8 sm:py-9">
        <RichContent html={article.content} className="prose prose-neutral max-w-none" />
      </section>
    </article>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-border bg-surface p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-3 text-sm leading-7 text-primary">{value}</p>
    </div>
  );
}

