import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const NEWS_LIST_PAGE_SIZE = 20;

export const NEWS_SUBCATEGORIES = [
  {
    slug: "trends",
    href: "/news/trends",
    title: "行业趋势",
    description: "聚合木作行业趋势观察、市场变化与经营决策信息。",
  },
  {
    slug: "enterprise",
    href: "/news/enterprise",
    title: "企业动态",
    description: "汇聚整木品牌动态、企业新闻、招商信息与行业最新动向。",
  },
  {
    slug: "tech",
    href: "/news/tech",
    title: "技术发展",
    description: "聚焦整木工艺、板材材料、生产技术与制造能力升级。",
  },
  {
    slug: "events",
    href: "/news/events",
    title: "行业活动",
    description: "汇集整木展会、设计周、行业论坛与新品发布活动信息。",
  },
  {
    slug: "aftermarket",
    href: "/news/aftermarket",
    title: "整木后市场",
    description: "聚焦木制品清洁、养护、保养与护理产品推荐。",
  },
] as const;

export type NewsSubcategorySlug = (typeof NEWS_SUBCATEGORIES)[number]["slug"];

export function getNewsSubcategory(slug: string) {
  return NEWS_SUBCATEGORIES.find((item) => item.slug === slug) ?? null;
}

export function buildPublishedNewsWhere(): Prisma.ArticleWhereInput {
  return {
    status: "approved",
    OR: [
      { categoryHref: "/news" },
      { categoryHref: { startsWith: "/news/" } },
      { subHref: "/news" },
      { subHref: { startsWith: "/news/" } },
    ],
  };
}

export function buildPublishedNewsSubcategoryWhere(href: string): Prisma.ArticleWhereInput {
  return {
    AND: [
      buildPublishedNewsWhere(),
      { OR: [{ subHref: href }, { categoryHref: href }] },
    ],
  };
}

export async function getPublishedNewsSubcategoryPage(slug: NewsSubcategorySlug, requestedPage: number) {
  const subcategory = getNewsSubcategory(slug);
  if (!subcategory) return null;

  const where = buildPublishedNewsSubcategoryWhere(subcategory.href);
  const total = await prisma.article.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / NEWS_LIST_PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  const items = await prisma.article.findMany({
    where,
    orderBy: [
      { isPinned: "desc" },
      { publishedAt: "desc" },
      { updatedAt: "desc" },
      { id: "desc" },
    ],
    skip: (page - 1) * NEWS_LIST_PAGE_SIZE,
    take: NEWS_LIST_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  return { subcategory, items, total, totalPages, page };
}
