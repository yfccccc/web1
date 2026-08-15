import type { MemberType } from "@/lib/member-access";

export const ENTERPRISE_BASIC_ARTICLE_LIMIT = 5;
export const ENTERPRISE_BASIC_ARTICLE_CATEGORY_HREF = "/news";
export const ENTERPRISE_BASIC_ARTICLE_SUB_HREF = "/news/enterprise";
export const ENTERPRISE_BASIC_GALLERY_LIMIT = 5;

export function isEnterpriseBasicArticleLocation(categoryHref: string | null | undefined, subHref: string | null | undefined) {
  return categoryHref === ENTERPRISE_BASIC_ARTICLE_CATEGORY_HREF && subHref === ENTERPRISE_BASIC_ARTICLE_SUB_HREF;
}

export function canMemberUseArticleLocation(
  memberType: MemberType,
  categoryHref: string | null | undefined,
  subHref: string | null | undefined
) {
  return memberType !== "enterprise_basic" || isEnterpriseBasicArticleLocation(categoryHref, subHref);
}

export function getCalendarYearRange(now = new Date()) {
  const year = now.getUTCFullYear();
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}

export function isAnnualLimitReached(usedCount: number, limit: number | null) {
  return limit != null && usedCount >= limit;
}
