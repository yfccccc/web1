import { prisma } from "@/lib/prisma";
import { APP_SETTING_KEYS } from "@/lib/app-settings";
import { ENTERPRISE_BASIC_ARTICLE_LIMIT, ENTERPRISE_BASIC_GALLERY_LIMIT } from "@/lib/enterprise-basic-limits";

export type LegacyMemberType = "enterprise_basic" | "personal" | "enterprise_advanced";

export type MembershipRule = {
  memberType: LegacyMemberType;
  label: string;
  siteLabel: string;
  publishCategoryHrefs: string[];
  newsPublishLimit: number | null;
  galleryUploadLimit: number | null;
  canSubmitStandardFeedback: boolean;
  canLinkStandards: boolean;
  canLinkTerms: boolean;
  canUploadGallery: boolean;
  canDownloadStandard: boolean;
  canDownloadReport: boolean;
  canRecommendContent: boolean;
  monthlyRecommendationLimit: number;
  defaultRankingWeight: number;
  supportsEnterpriseProfile: boolean;
  supportsEnterpriseSite: boolean;
  supportsDictionaryContribution: boolean;
  supportsStandardCoBuild: boolean;
  supportsSubAccounts: boolean;
  supportsSeoSettings: boolean;
  supportsPriorityDisplay: boolean;
};

export type MembershipRulesMap = Record<LegacyMemberType, MembershipRule>;

const ALL_PUBLISH_CATEGORIES = ["/news", "/brands", "/dictionary", "/standards", "/awards"] as const;

const DEFAULT_MEMBERSHIP_RULES: MembershipRulesMap = {
  enterprise_basic: {
    memberType: "enterprise_basic",
    label: "企业基础会员",
    siteLabel: "企业基础会员",
    publishCategoryHrefs: ["/news"],
    newsPublishLimit: ENTERPRISE_BASIC_ARTICLE_LIMIT,
    galleryUploadLimit: ENTERPRISE_BASIC_GALLERY_LIMIT,
    canSubmitStandardFeedback: true,
    canLinkStandards: true,
    canLinkTerms: true,
    canUploadGallery: true,
    canDownloadStandard: true,
    canDownloadReport: true,
    canRecommendContent: false,
    monthlyRecommendationLimit: 0,
    defaultRankingWeight: 10,
    supportsEnterpriseProfile: true,
    supportsEnterpriseSite: true,
    supportsDictionaryContribution: true,
    supportsStandardCoBuild: true,
    supportsSubAccounts: false,
    supportsSeoSettings: false,
    supportsPriorityDisplay: false,
  },
  personal: {
    memberType: "personal",
    label: "个人会员",
    siteLabel: "个人会员",
    publishCategoryHrefs: ["/news"],
    newsPublishLimit: 2,
    galleryUploadLimit: null,
    canSubmitStandardFeedback: true,
    canLinkStandards: false,
    canLinkTerms: false,
    canUploadGallery: false,
    canDownloadStandard: true,
    canDownloadReport: true,
    canRecommendContent: false,
    monthlyRecommendationLimit: 0,
    defaultRankingWeight: 20,
    supportsEnterpriseProfile: false,
    supportsEnterpriseSite: false,
    supportsDictionaryContribution: true,
    supportsStandardCoBuild: true,
    supportsSubAccounts: false,
    supportsSeoSettings: false,
    supportsPriorityDisplay: false,
  },
  enterprise_advanced: {
    memberType: "enterprise_advanced",
    label: "企业VIP会员",
    siteLabel: "企业VIP会员",
    publishCategoryHrefs: [...ALL_PUBLISH_CATEGORIES],
    newsPublishLimit: null,
    galleryUploadLimit: null,
    canSubmitStandardFeedback: true,
    canLinkStandards: true,
    canLinkTerms: true,
    canUploadGallery: true,
    canDownloadStandard: true,
    canDownloadReport: true,
    canRecommendContent: true,
    monthlyRecommendationLimit: 2,
    defaultRankingWeight: 30,
    supportsEnterpriseProfile: true,
    supportsEnterpriseSite: true,
    supportsDictionaryContribution: true,
    supportsStandardCoBuild: true,
    supportsSubAccounts: true,
    supportsSeoSettings: true,
    supportsPriorityDisplay: true,
  },
};

function parseNumber(value: unknown, fallback: number | null) {
  if (value == null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed < 0 ? 0 : parsed;
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return fallback;
}

function normalizePublishCategoryHrefs(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const next = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => ALL_PUBLISH_CATEGORIES.includes(item as (typeof ALL_PUBLISH_CATEGORIES)[number]));
  return next.length > 0 ? Array.from(new Set(next)) : fallback;
}

function normalizeMembershipRule(
  memberType: LegacyMemberType,
  value: unknown,
  fallback: MembershipRule
): MembershipRule {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const isEnterpriseBasic = memberType === "enterprise_basic";
  return {
    memberType,
    label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : fallback.label,
    siteLabel:
      typeof source.siteLabel === "string" && source.siteLabel.trim() ? source.siteLabel.trim() : fallback.siteLabel,
    publishCategoryHrefs: isEnterpriseBasic
      ? ["/news"]
      : normalizePublishCategoryHrefs(source.publishCategoryHrefs, fallback.publishCategoryHrefs),
    newsPublishLimit: isEnterpriseBasic
      ? ENTERPRISE_BASIC_ARTICLE_LIMIT
      : parseNumber(source.newsPublishLimit, fallback.newsPublishLimit),
    galleryUploadLimit: isEnterpriseBasic
      ? ENTERPRISE_BASIC_GALLERY_LIMIT
      : parseNumber(source.galleryUploadLimit, fallback.galleryUploadLimit),
    canSubmitStandardFeedback: parseBoolean(source.canSubmitStandardFeedback, fallback.canSubmitStandardFeedback),
    canLinkStandards: parseBoolean(source.canLinkStandards, fallback.canLinkStandards),
    canLinkTerms: parseBoolean(source.canLinkTerms, fallback.canLinkTerms),
    canUploadGallery: parseBoolean(source.canUploadGallery, fallback.canUploadGallery),
    canDownloadStandard: parseBoolean(source.canDownloadStandard, fallback.canDownloadStandard),
    canDownloadReport: parseBoolean(source.canDownloadReport, fallback.canDownloadReport),
    canRecommendContent: parseBoolean(source.canRecommendContent, fallback.canRecommendContent),
    monthlyRecommendationLimit: parseNumber(
      source.monthlyRecommendationLimit,
      fallback.monthlyRecommendationLimit
    ) ?? fallback.monthlyRecommendationLimit,
    defaultRankingWeight: parseNumber(source.defaultRankingWeight, fallback.defaultRankingWeight) ?? fallback.defaultRankingWeight,
    supportsEnterpriseProfile: parseBoolean(source.supportsEnterpriseProfile, fallback.supportsEnterpriseProfile),
    supportsEnterpriseSite: parseBoolean(source.supportsEnterpriseSite, fallback.supportsEnterpriseSite),
    supportsDictionaryContribution: parseBoolean(
      source.supportsDictionaryContribution,
      fallback.supportsDictionaryContribution
    ),
    supportsStandardCoBuild: parseBoolean(source.supportsStandardCoBuild, fallback.supportsStandardCoBuild),
    supportsSubAccounts: parseBoolean(source.supportsSubAccounts, fallback.supportsSubAccounts),
    supportsSeoSettings: parseBoolean(source.supportsSeoSettings, fallback.supportsSeoSettings),
    supportsPriorityDisplay: parseBoolean(source.supportsPriorityDisplay, fallback.supportsPriorityDisplay),
  };
}

export function getDefaultMembershipRules(): MembershipRulesMap {
  return structuredClone(DEFAULT_MEMBERSHIP_RULES);
}

export function normalizeMembershipRules(value: unknown): MembershipRulesMap {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enterprise_basic: normalizeMembershipRule(
      "enterprise_basic",
      source.enterprise_basic,
      DEFAULT_MEMBERSHIP_RULES.enterprise_basic
    ),
    personal: normalizeMembershipRule("personal", source.personal, DEFAULT_MEMBERSHIP_RULES.personal),
    enterprise_advanced: normalizeMembershipRule(
      "enterprise_advanced",
      source.enterprise_advanced,
      DEFAULT_MEMBERSHIP_RULES.enterprise_advanced
    ),
  };
}

export async function getMembershipRules(): Promise<MembershipRulesMap> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.MEMBERSHIP_RULES },
    select: { value: true },
  });

  if (!row?.value) {
    return getDefaultMembershipRules();
  }

  try {
    return normalizeMembershipRules(JSON.parse(row.value));
  } catch {
    return getDefaultMembershipRules();
  }
}

export async function getMembershipRule(memberType: LegacyMemberType): Promise<MembershipRule> {
  const rules = await getMembershipRules();
  return rules[memberType];
}

export function getMembershipRuleSync(memberType: LegacyMemberType, rules?: MembershipRulesMap): MembershipRule {
  const source = rules ?? DEFAULT_MEMBERSHIP_RULES;
  return source[memberType];
}

export function getMemberTypeLabel(memberType: LegacyMemberType, rules?: MembershipRulesMap): string {
  return getMembershipRuleSync(memberType, rules).label;
}
