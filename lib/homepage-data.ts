import { unstable_cache } from "next/cache";
import { articleOrderByPinnedLatest, articleOrderByPinnedPopular } from "@/lib/articles";
import { getHomepageBrandDirectoryList } from "@/lib/brand-directory";
import { ENGINEER_CATEGORY_LABELS, getLatestHuadianYear, getTop10ByYear } from "@/lib/huadianbang";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_VISUAL_SETTINGS, type SiteVisualSettings } from "@/lib/site-visual-config";
import { getSiteVisualSettings } from "@/lib/site-visual-settings";

const REGION_ORDER = ["华东", "华中", "华南", "西南", "西北", "华北", "东北"] as const;

function isReadableLabel(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t) return false;
  if (t.includes("?")) return false;
  if (/^[BTSDW]-\d{14}$/.test(t)) return false;
  return true;
}

function pickReadableHomepageArticles<T extends { title: string | null | undefined }>(items: T[], limit: number) {
  return items
    .filter((item) => isReadableLabel(item.title))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      title: item.title!.trim(),
    }));
}

export type HomepageLinkItem = {
  label: string;
  href: string;
};

export type HomepageStructureCard = {
  title: string;
  subtitle: string;
  desc: string;
  href: string;
  image: string;
  items: HomepageLinkItem[];
};

export type HomepageRegionCount = {
  region: string;
  count: number;
};

export type HomepageBrandItem = {
  id: string;
  enterpriseName: string;
  headline: string;
  locationLabel: string;
  logoUrl: string | null;
  slug: string;
  detailHref: string;
  contactLabel: string;
  region?: string;
};

type HomepageArticleItem = {
  id: string;
  title: string | null;
  slug: string;
};

type HomepageStandardItem = {
  id: string;
  title: string | null;
  slug: string;
  versionLabel: string | null;
};

type HomepageAwardItem = {
  id: string;
  title: string | null;
  slug: string;
  year: number | null;
};

type HomepageBrandSourceItem = Omit<HomepageBrandItem, "detailHref"> & { publicUrl: string };

function buildHomepageData({
  visualSettings,
  latestNews,
  hotNews,
  latestBrands,
  latestTerms,
  latestStandards,
  latestAwards,
}: {
  visualSettings: SiteVisualSettings;
  latestNews: HomepageArticleItem[];
  hotNews: HomepageArticleItem[];
  latestBrands: HomepageBrandSourceItem[];
  latestTerms: HomepageArticleItem[];
  latestStandards: HomepageStandardItem[];
  latestAwards: HomepageAwardItem[];
}) {
  const regionMap = new Map<string, number>();
  REGION_ORDER.forEach((region) => regionMap.set(region, 0));
  latestBrands.forEach((enterprise) => {
    const region = (enterprise.region || "").trim();
    if (regionMap.has(region)) {
      regionMap.set(region, (regionMap.get(region) ?? 0) + 1);
    }
  });

  const safeLatestNews = pickReadableHomepageArticles(latestNews, 10);
  const safeHotNews = pickReadableHomepageArticles(hotNews, 10);
  const safeBrands = latestBrands.filter((item) => isReadableLabel(item.enterpriseName));
  const safeTerms = latestTerms.filter((item) => isReadableLabel(item.title));
  const safeStandards = latestStandards.filter((item) => isReadableLabel(item.title));
  const safeAwards = latestAwards.filter((item) => isReadableLabel(item.title));
  const huadianYear = getLatestHuadianYear();

  const structureCards: HomepageStructureCard[] = [
    {
      title: "整木市场",
      subtitle: "品牌选择与选购问答",
      desc: "覆盖整木品牌与整木选购 FAQ，快速完成品牌对比与决策。",
      href: "/brands/all",
      image: visualSettings.backgrounds.homeStructureMarket,
      items: safeBrands.map((item) => ({
        label: item.enterpriseName,
        href: item.publicUrl,
      })),
    },
    {
      title: "整木词库",
      subtitle: "术语与知识结构",
      desc: "沉淀概念定义、工艺术语与行业释义，形成统一表达。",
      href: "/dictionary/all",
      image: visualSettings.backgrounds.homeStructureDictionary,
      items: [
        { label: "品牌百科", href: "/dictionary/brand-baike" },
        { label: "高定生活", href: "/dictionary/high-end-life" },
        ...safeTerms.map((item) => ({ label: item.title!.trim(), href: `/dictionary/${item.slug}` })),
      ],
    },
    {
      title: "整木标准",
      subtitle: "材料 / 工艺 / 服务",
      desc: "以结构化标准体系支持落地执行与跨团队协作。",
      href: "/standards/all",
      image: visualSettings.backgrounds.homeStructureStandards,
      items: safeStandards.map((item) => ({
        label: `${item.versionLabel ? `${item.versionLabel} 路 ` : ""}${item.title!.trim()}`,
        href: `/standards/${item.slug || item.id}`,
      })),
    },
    {
      title: "整木评选",
      subtitle: "规则透明、流程可追溯",
      desc: "以公开规则、评审机制和公示流程建立行业公信力。",
      href: "/awards",
      image: visualSettings.backgrounds.homeStructureAwards,
      items: safeAwards.map((item) => ({
        label: `${item.year ? `${item.year} 路 ` : ""}${item.title!.trim()}`,
        href: `/awards/${item.slug || item.id}`,
      })),
    },
  ];

  const enterprises = latestBrands.map((item) => ({
    id: item.id,
    enterpriseName: item.enterpriseName,
    headline: item.headline,
    locationLabel: item.locationLabel,
    logoUrl: item.logoUrl,
    slug: item.slug,
    detailHref: item.publicUrl,
    contactLabel: item.contactLabel,
    region: item.region,
  }));

  return {
    visualSettings,
    latestNews: safeLatestNews,
    hotNews: safeHotNews,
    structureCards,
    middleAd: visualSettings.ads.homeMiddle,
    enterprises,
    regionCounts: REGION_ORDER.map((region) => ({ region, count: regionMap.get(region) ?? 0 })),
    huadianYear,
    huadianTop10: getTop10ByYear(huadianYear),
    huadianPartner: Object.values(ENGINEER_CATEGORY_LABELS).slice(0, 3),
  };
}

function createHomepageFallbackData() {
  return buildHomepageData({
    visualSettings: DEFAULT_SITE_VISUAL_SETTINGS,
    latestNews: [],
    hotNews: [],
    latestBrands: [],
    latestTerms: [],
    latestStandards: [],
    latestAwards: [],
  });
}

async function getHomepageDataUncached() {
  const [visualSettings, latestNews, hotNews, latestBrands, latestTerms, latestStandards, latestAwards] = await Promise.all([
    getSiteVisualSettings(),
    prisma.article.findMany({
      where: { status: "approved", OR: [{ categoryHref: { startsWith: "/news" } }, { subHref: { startsWith: "/news" } }] },
      orderBy: articleOrderByPinnedLatest,
      take: 20,
      select: { id: true, title: true, slug: true },
    }),
    prisma.article.findMany({
      where: { status: "approved", OR: [{ categoryHref: { startsWith: "/news" } }, { subHref: { startsWith: "/news" } }] },
      orderBy: articleOrderByPinnedPopular,
      take: 20,
      select: { id: true, title: true, slug: true },
    }),
    getHomepageBrandDirectoryList(8),
    prisma.article.findMany({
      where: { status: "approved", OR: [{ categoryHref: { startsWith: "/dictionary" } }, { subHref: { startsWith: "/dictionary" } }] },
      orderBy: articleOrderByPinnedLatest,
      take: 8,
      select: { id: true, title: true, slug: true },
    }),
    prisma.article.findMany({
      where: { status: "approved", OR: [{ categoryHref: { startsWith: "/standards" } }, { subHref: { startsWith: "/standards" } }] },
      orderBy: articleOrderByPinnedLatest,
      take: 8,
      select: { id: true, title: true, slug: true, versionLabel: true },
    }),
    prisma.award.findMany({
      orderBy: [{ year: "desc" }, { updatedAt: "desc" }],
      take: 8,
      select: { id: true, title: true, slug: true, year: true },
    }),
  ]);

  return buildHomepageData({
    visualSettings,
    latestNews,
    hotNews,
    latestBrands,
    latestTerms,
    latestStandards,
    latestAwards,
  });
}

const getCachedHomepageData = unstable_cache(getHomepageDataUncached, ["homepage-data"], {
  revalidate: 300,
  tags: ["homepage-data"],
});

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

export async function getHomepageData() {
  try {
    return await withTimeout(getCachedHomepageData(), 8000, createHomepageFallbackData());
  } catch {
    return createHomepageFallbackData();
  }
}
