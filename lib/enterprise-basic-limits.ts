export const ENTERPRISE_BASIC_ARTICLE_LIMIT = 5;
export const ENTERPRISE_BASIC_ARTICLE_CATEGORY_HREF = "/news";
export const ENTERPRISE_BASIC_ARTICLE_SUB_HREF = "/news/enterprise";
export const ENTERPRISE_BASIC_GALLERY_LIMIT = 5;

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
