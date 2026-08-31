import { prisma } from "@/lib/prisma";

export const RESTRICTED_MEMBER_PUBLICATION = {
  personal: { categoryHref: "/news", subHref: "/news/enterprise", annualLimit: 2 },
  enterprise_basic: { categoryHref: "/news", subHref: "/news/enterprise", annualLimit: 5 },
} as const;

const SPECIAL_ENTERPRISE_PUBLISHING_QUOTA_MEMBER_IDS = new Set([
  "cmq0aj24d00c012ug20mbbnzo", // zhzx / 迪凡广告
  "cmmyd75kk000cwnv1onvawe8q", // dingzhijiaju / 浙江温州
  "cmmyd6f0m000awnv11ni35xja", // zhihuijia
]);

export function isRestrictedMemberType(memberType: string) {
  return memberType === "personal" || memberType === "enterprise_basic";
}

export function hasSpecialEnterprisePublishingQuota(memberId: string | null | undefined, memberType: string) {
  return memberType === "enterprise_basic" && Boolean(memberId && SPECIAL_ENTERPRISE_PUBLISHING_QUOTA_MEMBER_IDS.has(memberId));
}

export function resolveRestrictedAnnualLimit(input: {
  memberId: string;
  memberType: string;
  effectiveAnnualLimit?: number | null;
}) {
  if (!isRestrictedMemberType(input.memberType)) return null;
  const defaultLimit = RESTRICTED_MEMBER_PUBLICATION[input.memberType].annualLimit;
  if (!hasSpecialEnterprisePublishingQuota(input.memberId, input.memberType)) return defaultLimit;
  return typeof input.effectiveAnnualLimit === "number" && Number.isInteger(input.effectiveAnnualLimit) && input.effectiveAnnualLimit >= 0
    ? input.effectiveAnnualLimit
    : defaultLimit;
}

export async function assertRestrictedMemberCanSubmit(input: {
  memberId: string;
  memberType: string;
  role: string | null;
  accountStatus: string | null;
  phoneVerified: boolean;
  effectiveAnnualLimit?: number | null;
}) {
  if (!isRestrictedMemberType(input.memberType) || input.role === "ADMIN" || input.role === "SUPER_ADMIN") return null;
  const annualLimit = resolveRestrictedAnnualLimit(input);
  if (input.memberType === "personal" && input.accountStatus !== "active") return "账号尚未通过审核";
  if (input.memberType === "personal" && !input.phoneVerified) return "手机号尚未完成验证";

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  const count = await prisma.article.count({ where: { authorMemberId: input.memberId, createdAt: { gte: start, lt: end } } });
  if (annualLimit != null && count >= annualLimit) return `年度投稿额度已用完（${annualLimit}篇）`;
  return null;
}
