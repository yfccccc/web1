import { MEMBER_PUBLISH_CATEGORY_OPTIONS } from "@/lib/content-taxonomy";
import { getMemberGrantSettings, type GrantFeatureKey, type MemberGrantSettings } from "@/lib/member-grants";
import { getMembershipRule, type LegacyMemberType, type MembershipRule } from "@/lib/membership-rules";
import { prisma } from "@/lib/prisma";
import { RESTRICTED_MEMBER_PUBLICATION, isRestrictedMemberType } from "@/lib/membership-publishing";

export type EffectiveMemberFeatureAccess = Record<GrantFeatureKey, boolean>;

export type EffectiveMemberSubcategoryAccess = {
  href: string;
  label: string;
  enabled: boolean;
  annualLimit: number | null;
  usedCount: number;
  remainingCount: number | null;
};

export type EffectiveMemberCategoryAccess = {
  href: string;
  label: string;
  enabled: boolean;
  annualLimit: number | null;
  usedCount: number;
  remainingCount: number | null;
  subcategories: EffectiveMemberSubcategoryAccess[];
};

export type EffectiveMemberAccess = {
  year: number;
  memberType: LegacyMemberType;
  membershipRule: MembershipRule;
  features: EffectiveMemberFeatureAccess;
  categories: EffectiveMemberCategoryAccess[];
};

type UsageMaps = {
  categoryCounts: Map<string, number>;
  subcategoryCounts: Map<string, number>;
};

function getYearRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}

function getDefaultFeatureAccess(rule: MembershipRule): EffectiveMemberFeatureAccess {
  return {
    enterpriseSite: rule.supportsEnterpriseSite,
    seo: rule.supportsSeoSettings,
    recommendContent: rule.canRecommendContent,
    galleryUpload: rule.canUploadGallery,
    standardFeedback: rule.canSubmitStandardFeedback,
    dictionaryContribution: rule.supportsDictionaryContribution,
    standardCoBuild: rule.supportsStandardCoBuild,
    subAccounts: rule.supportsSubAccounts,
  };
}

function getDefaultCategoryLimit(rule: MembershipRule, categoryHref: string) {
  if (categoryHref === "/news") {
    return rule.newsPublishLimit;
  }
  return null;
}

async function getArticleUsageMaps(memberId: string, year: number): Promise<UsageMaps> {
  const { start, end } = getYearRange(year);
  const rows = await prisma.article.groupBy({
    by: ["categoryHref", "subHref"],
    where: {
      authorMemberId: memberId,
      createdAt: { gte: start, lt: end },
    },
    _count: { _all: true },
  });

  const categoryCounts = new Map<string, number>();
  const subcategoryCounts = new Map<string, number>();

  for (const row of rows) {
    const categoryHref = typeof row.categoryHref === "string" ? row.categoryHref : "";
    const subHref = typeof row.subHref === "string" ? row.subHref : "";
    const count = row._count._all;

    if (categoryHref) {
      categoryCounts.set(categoryHref, (categoryCounts.get(categoryHref) ?? 0) + count);
    }
    if (categoryHref && subHref) {
      subcategoryCounts.set(`${categoryHref}::${subHref}`, count);
    }
  }

  return { categoryCounts, subcategoryCounts };
}

function resolveRemainingCount(limit: number | null, usedCount: number) {
  if (limit == null) return null;
  return Math.max(0, limit - usedCount);
}

function isGrantActive(grants: MemberGrantSettings, at: Date) {
  const start = new Date(`${grants.activeFrom ?? `${grants.year}-01-01`}T00:00:00.000Z`);
  const end = new Date(`${grants.activeUntil ?? `${grants.year}-12-31`}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return at >= start && at <= end;
}

function resolveFeatureValue(
  defaultValue: boolean,
  grants: MemberGrantSettings,
  key: GrantFeatureKey,
  active: boolean
) {
  if (!active) return defaultValue;
  const override = grants.features[key];
  return typeof override === "boolean" ? override : defaultValue;
}

export function buildEffectiveMemberAccessFromSources(
  memberType: LegacyMemberType,
  membershipRule: MembershipRule,
  grants: MemberGrantSettings,
  usageMaps: UsageMaps,
  year: number
): EffectiveMemberAccess {
  const restrictedRule = isRestrictedMemberType(memberType) ? RESTRICTED_MEMBER_PUBLICATION[memberType] : null;
  const defaultFeatures = getDefaultFeatureAccess(membershipRule);
  const grantActive = isGrantActive(grants, new Date());

  const categories = MEMBER_PUBLISH_CATEGORY_OPTIONS.map((category) => {
    const defaultCategoryEnabled = restrictedRule
      ? category.href === restrictedRule.categoryHref
      : membershipRule.publishCategoryHrefs.includes(category.href);
    const defaultCategoryLimit = getDefaultCategoryLimit(membershipRule, category.href);
    const categoryGrant = grants.categories[category.href];
    const categoryEnabledOverride = grantActive ? categoryGrant?.enabled : null;
    const categoryLimitOverride = grantActive ? categoryGrant?.annualLimit : null;

    const subcategories = category.subs.map((sub) => {
      const subGrant = categoryGrant?.subcategories[sub.href];
      const defaultSubEnabled = defaultCategoryEnabled;
      const enabled = restrictedRule
        ? category.href === restrictedRule.categoryHref && sub.href === restrictedRule.subHref
        :
        typeof (grantActive ? subGrant?.enabled : null) === "boolean"
          ? Boolean(subGrant?.enabled)
          : defaultSubEnabled;
      const annualLimit = restrictedRule
        ? category.href === restrictedRule.categoryHref && sub.href === restrictedRule.subHref
          ? restrictedRule.annualLimit
          : null
        : (grantActive ? subGrant?.annualLimit : null) ?? null;
      const usedCount = usageMaps.subcategoryCounts.get(`${category.href}::${sub.href}`) ?? 0;
      return {
        href: sub.href,
        label: sub.label,
        enabled,
        annualLimit,
        usedCount,
        remainingCount: resolveRemainingCount(annualLimit, usedCount),
      } satisfies EffectiveMemberSubcategoryAccess;
    });

    const hasEnabledSubcategory = subcategories.some((sub) => sub.enabled);
    const enabled =
      typeof categoryEnabledOverride === "boolean"
        ? categoryEnabledOverride || hasEnabledSubcategory
        : defaultCategoryEnabled || hasEnabledSubcategory;
    const annualLimit = restrictedRule && category.href === restrictedRule.categoryHref
      ? restrictedRule.annualLimit
      : categoryLimitOverride ?? defaultCategoryLimit;
    const usedCount = usageMaps.categoryCounts.get(category.href) ?? 0;

    return {
      href: category.href,
      label: category.label,
      enabled,
      annualLimit,
      usedCount,
      remainingCount: resolveRemainingCount(annualLimit, usedCount),
      subcategories,
    } satisfies EffectiveMemberCategoryAccess;
  });

  return {
    year,
    memberType,
    membershipRule,
    features: {
      enterpriseSite: resolveFeatureValue(defaultFeatures.enterpriseSite, grants, "enterpriseSite", grantActive),
      seo: resolveFeatureValue(defaultFeatures.seo, grants, "seo", grantActive),
      recommendContent: resolveFeatureValue(defaultFeatures.recommendContent, grants, "recommendContent", grantActive),
      galleryUpload: resolveFeatureValue(defaultFeatures.galleryUpload, grants, "galleryUpload", grantActive),
      standardFeedback: resolveFeatureValue(defaultFeatures.standardFeedback, grants, "standardFeedback", grantActive),
      dictionaryContribution: resolveFeatureValue(
        defaultFeatures.dictionaryContribution,
        grants,
        "dictionaryContribution",
        grantActive
      ),
      standardCoBuild: resolveFeatureValue(defaultFeatures.standardCoBuild, grants, "standardCoBuild", grantActive),
      subAccounts: resolveFeatureValue(defaultFeatures.subAccounts, grants, "subAccounts", grantActive),
    },
    categories,
  };
}

export async function getEffectiveMemberAccessForMember(
  memberId: string,
  memberType: LegacyMemberType,
  year = new Date().getFullYear()
) {
  const [membershipRule, grants, usageMaps] = await Promise.all([
    getMembershipRule(memberType),
    getMemberGrantSettings(memberId),
    getArticleUsageMaps(memberId, year),
  ]);

  return buildEffectiveMemberAccessFromSources(memberType, membershipRule, grants, usageMaps, year);
}

export function findEffectiveCategoryAccess(access: EffectiveMemberAccess, categoryHref: string) {
  return access.categories.find((category) => category.href === categoryHref) ?? null;
}

export function findEffectiveSubcategoryAccess(
  access: EffectiveMemberAccess,
  categoryHref: string,
  subHref: string | null | undefined
) {
  if (!subHref) return null;
  const category = findEffectiveCategoryAccess(access, categoryHref);
  return category?.subcategories.find((sub) => sub.href === subHref) ?? null;
}
