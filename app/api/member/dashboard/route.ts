import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getEffectiveMemberAccessForMember } from "@/lib/member-access-resolver";
import { getMemberSiteSettings } from "@/lib/member-site-settings";
import { getEffectiveVerificationStatus } from "@/lib/member-verification";
import { isDifanMonthlyNewsSummaryEnabled } from "@/lib/difan-monthly-news-summary";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "\u672a\u767b\u5f55" }, { status: 401 });

  const currentYear = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(currentYear + 1, 0, 1, 0, 0, 0, 0));
  const memberAccess = await getEffectiveMemberAccessForMember(session.sub, session.memberType, currentYear);
  const membershipRule = memberAccess.membershipRule;
  const newsCategory = memberAccess.categories.find((item) => item.href === "/news") ?? null;

  const [
    articleStats,
    galleryStats,
    standardFeedbackStats,
    galleryAnnualCount,
    standardFeedbackAnnualCount,
    latestVerification,
    enterprise,
    siteSettings,
  ] = await Promise.all([
    prisma.article.groupBy({
      by: ["status"],
      where: { authorMemberId: session.sub },
      _count: { _all: true },
    }),
    prisma.galleryImage.groupBy({
      by: ["status"],
      where: { authorMemberId: session.sub },
      _count: { _all: true },
    }),
    prisma.standardFeedback.groupBy({
      by: ["status"],
      where: { memberId: session.sub },
      _count: { _all: true },
    }),
    prisma.galleryImage.count({
      where: { authorMemberId: session.sub, createdAt: { gte: yearStart, lt: yearEnd } },
    }),
    prisma.standardFeedback.count({
      where: { memberId: session.sub, createdAt: { gte: yearStart, lt: yearEnd } },
    }),
    prisma.enterpriseVerification.findFirst({
      where: { memberId: session.sub },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        companyName: true,
        updatedAt: true,
        reviewNote: true,
      },
    }),
    prisma.enterprise.findUnique({
      where: { memberId: session.sub },
      select: {
        id: true,
        companyName: true,
        companyShortName: true,
        verificationStatus: true,
      },
    }),
    session.memberType === "personal" ? Promise.resolve(null) : getMemberSiteSettings(session.sub),
  ]);

  const effectiveVerification = getEffectiveVerificationStatus({
    member: { memberType: session.memberType },
    verification: latestVerification,
    enterprise,
  });

  const summarize = (rows: Array<{ status: string; _count: { _all: number } }>) => ({
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    draft: rows.find((row) => row.status === "draft")?._count._all ?? 0,
    pending: rows.find((row) => row.status === "pending")?._count._all ?? 0,
    approved: rows.find((row) => row.status === "approved")?._count._all ?? 0,
    rejected: rows.find((row) => row.status === "rejected")?._count._all ?? 0,
  });

  const articles = summarize(articleStats);
  const gallery = summarize(galleryStats);
  const standardFeedback = summarize(standardFeedbackStats);
  const galleryLimit = membershipRule.galleryUploadLimit;
  const recommendationLimit = membershipRule.monthlyRecommendationLimit;

  return NextResponse.json({
    member: {
      type: session.memberType,
      label: membershipRule.label,
      phone: session.phone,
      rankingWeight: session.rankingWeight,
      canManageMembers: session.canManageMembers,
    },
    authorization: {
      year: currentYear,
      publishingCategories: memberAccess.categories.map((category) => ({
        href: category.href,
        label: category.label,
        enabled: category.enabled,
        annualLimit: category.annualLimit,
        remainingCount: category.remainingCount,
        subcategories: category.subcategories.map((sub) => ({
          href: sub.href,
          label: sub.label,
          enabled: sub.enabled,
          annualLimit: sub.annualLimit,
          remainingCount: sub.remainingCount,
        })),
      })),
      news: newsCategory
        ? {
            enabled: newsCategory.enabled,
            annualLimit: newsCategory.annualLimit,
            usedCount: newsCategory.usedCount,
            remainingCount: newsCategory.remainingCount,
          }
        : {
            enabled: false,
            annualLimit: null,
            usedCount: 0,
            remainingCount: null,
          },
      gallery: {
        enabled: memberAccess.features.galleryUpload,
        annualLimit: galleryLimit,
        usedCount: galleryAnnualCount,
        remainingCount: galleryLimit == null ? null : Math.max(0, galleryLimit - galleryAnnualCount),
      },
      standardFeedback: {
        enabled: memberAccess.features.standardFeedback,
        usedCount: standardFeedbackAnnualCount,
      },
      recommendation: {
        enabled: memberAccess.features.recommendContent,
        annualLimit: recommendationLimit,
        usedCount: 0,
        remainingCount: recommendationLimit,
      },
    },
    quotas: {
      newsPublishLimit: newsCategory?.annualLimit ?? membershipRule.newsPublishLimit,
      galleryUploadLimit: galleryLimit,
      monthlyRecommendationLimit: recommendationLimit,
    },
    features: {
      supportsEnterpriseProfile: membershipRule.supportsEnterpriseProfile,
      supportsEnterpriseSite: memberAccess.features.enterpriseSite,
      supportsDictionaryContribution: memberAccess.features.dictionaryContribution,
      supportsStandardCoBuild: memberAccess.features.standardCoBuild,
      supportsSubAccounts: memberAccess.features.subAccounts,
      supportsSeoSettings: memberAccess.features.seo,
      canRecommendContent: memberAccess.features.recommendContent,
      canUploadGallery: memberAccess.features.galleryUpload,
      canSubmitStandardFeedback: memberAccess.features.standardFeedback,
      monthlyNewsSummary: isDifanMonthlyNewsSummaryEnabled(session.sub),
    },
    stats: {
      articles,
      gallery,
      standardFeedback,
    },
    latestVerification,
    effectiveVerification,
    enterprise,
    siteSettingsSummary: siteSettings
      ? {
          heroTitle: siteSettings.heroTitle,
          syncEnabled: siteSettings.sync.syncEnabled,
          enabledModules: Object.values(siteSettings.modules).filter(Boolean).length,
        }
      : null,
  });
}
