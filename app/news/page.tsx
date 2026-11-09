import type { Metadata } from "next";
import { CategoryHome } from "@/components/CategoryHome";
import { PublishedContentPanel } from "@/components/PublishedContentPanel";
import { getCategoryWithMetaByHref } from "@/lib/categories";
import { buildCategoryMetadata } from "@/lib/category-metadata";
import { articleOrderByPinnedLatest } from "@/lib/articles";
import { prisma } from "@/lib/prisma";
import { buildNewsPath, getArticleSegment } from "@/lib/share-config";
import { decodeEscapedUnicode } from "@/lib/text";
import { getNewsAftermarketConfig, NEWS_AFTERMARKET_SUBCATEGORY } from "@/lib/news-aftermarket";
import { buildPublishedNewsWhere, buildPublishedNewsSubcategoryWhere } from "@/lib/news-listing";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildCategoryMetadata(
    "/news",
    "整木资讯",
    "整木资讯栏目，聚合行业趋势、企业动态、技术发展与行业活动信息。",
    "/api/og/news-default"
  );
}

export default async function NewsPage() {
  const category = await getCategoryWithMetaByHref("/news");
  const subcategories = category?.subcategories ?? [];
  const aftermarketConfig = await getNewsAftermarketConfig();

  const [articles, subcategoryRows] = await Promise.all([
    prisma.article.findMany({
      where: buildPublishedNewsWhere(),
      orderBy: articleOrderByPinnedLatest,
      take: 8,
      select: { id: true, title: true, slug: true, publishedAt: true, updatedAt: true },
    }),
    Promise.all(
      subcategories.map((sub) =>
        prisma.article.findMany({
          where: buildPublishedNewsSubcategoryWhere(sub.href),
          orderBy: articleOrderByPinnedLatest,
          take: sub.href === NEWS_AFTERMARKET_SUBCATEGORY.href ? aftermarketConfig.homeDisplayCount : 3,
          select: { id: true, title: true, slug: true },
        })
      )
    ),
  ]);

  const subcategoryLatest = subcategories.reduce<Record<string, Array<{ title: string; href: string }>>>((acc, sub, idx) => {
    acc[sub.href] = (subcategoryRows[idx] ?? []).map((item) => ({
      title: decodeEscapedUnicode(item.title),
      href: buildNewsPath(getArticleSegment(item)),
    }));
    return acc;
  }, {});

  return (
    <CategoryHome
      basePath="/news"
      category={category}
      variant="editorial"
      searchHref="/news/all"
      subcategoryLatest={subcategoryLatest}
    >
      <PublishedContentPanel
        sectionTitle="资讯速览"
        sectionDesc="按发布时间与优先级整理最新资讯，方便快速浏览当下值得关注的行业内容。"
        items={articles.map((x) => ({
          id: x.id,
          title: decodeEscapedUnicode(x.title),
          href: buildNewsPath(getArticleSegment(x)),
          meta: `发布时间：${(x.publishedAt ?? x.updatedAt).toLocaleDateString("zh-CN")}`,
        }))}
        categoryHref="/news/all"
        variant="editorial"
      />
    </CategoryHome>
  );
}
