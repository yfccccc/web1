import type { Metadata } from "next";
import { NewsSubcategoryListing } from "@/components/NewsSubcategoryListing";
import { DEFAULT_NEWS_SHARE_IMAGE } from "@/lib/news-sharing";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: "行业趋势｜整木行业资讯",
    description: "聚合木作行业趋势观察、市场变化与经营决策信息。",
    path: "/news/trends",
    type: "website",
    image: DEFAULT_NEWS_SHARE_IMAGE,
    absoluteTitle: true,
  });
}

export default async function NewsTrendsPage({ searchParams }: Props) {
  const { page } = await searchParams;
  return <NewsSubcategoryListing slug="trends" page={page} />;
}
