import { prisma } from "@/lib/prisma";

export const RESTRICTED_MEMBER_PUBLICATION = {
  personal: { categoryHref: "/news", subHref: "/news/enterprise", annualLimit: 2 },
  enterprise_basic: { categoryHref: "/news", subHref: "/news/enterprise", annualLimit: 5 },
} as const;

export function isRestrictedMemberType(memberType: string) {
  return memberType === "personal" || memberType === "enterprise_basic";
}

export async function assertRestrictedMemberCanSubmit(input: {
  memberId: string;
  memberType: string;
  role: string | null;
  accountStatus: string | null;
  phoneVerified: boolean;
}) {
  if (!isRestrictedMemberType(input.memberType) || input.role === "ADMIN" || input.role === "SUPER_ADMIN") return null;
  const rule = RESTRICTED_MEMBER_PUBLICATION[input.memberType];
  if (input.memberType === "personal" && input.accountStatus !== "active") return "账号尚未通过审核";
  if (input.memberType === "personal" && !input.phoneVerified) return "手机号尚未完成验证";

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  const count = await prisma.article.count({ where: { authorMemberId: input.memberId, createdAt: { gte: start, lt: end } } });
  if (count >= rule.annualLimit) return `年度投稿额度已用完（${rule.annualLimit}篇）`;
  return null;
}
