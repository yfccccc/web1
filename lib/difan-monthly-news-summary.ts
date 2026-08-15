import type { Prisma } from "@prisma/client";
import { NEWS_SUBCATEGORY_OPTIONS } from "@/lib/content-taxonomy";

export const DIFAN_MONTHLY_NEWS_SUMMARY_MEMBER_ID = "cmq0aj24d00c012ug20mbbnzo";
export const DIFAN_MONTHLY_NEWS_PAGE_SIZE = 50;
export const MONTHLY_NEWS_TIME_ZONE = "Asia/Shanghai";

export type ShanghaiMonthRange = {
  month: string;
  label: string;
  start: Date;
  end: Date;
};

export type ShanghaiMonthParseResult =
  | { ok: true; range: ShanghaiMonthRange }
  | { ok: false; reason: "invalid" | "future" };

export function isDifanMonthlyNewsSummaryEnabled(memberId: string | null | undefined) {
  return memberId === DIFAN_MONTHLY_NEWS_SUMMARY_MEMBER_ID;
}

export function getCurrentShanghaiMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MONTHLY_NEWS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Unable to resolve the current Shanghai month");
  return `${year}-${month}`;
}

export function parseShanghaiMonth(value: string, now = new Date()): ShanghaiMonthParseResult {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return { ok: false, reason: "invalid" };

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 2000 || year > 2100) return { ok: false, reason: "invalid" };
  if (value > getCurrentShanghaiMonth(now)) return { ok: false, reason: "future" };

  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(year, monthNumber - 1, 1) - shanghaiOffsetMs);
  const end = new Date(Date.UTC(year, monthNumber, 1) - shanghaiOffsetMs);

  return {
    ok: true,
    range: {
      month: value,
      label: `${year}年${monthNumber}月`,
      start,
      end,
    },
  };
}

export function buildDifanMonthlyNewsWhere(memberId: string, range: ShanghaiMonthRange): Prisma.ArticleWhereInput {
  return {
    authorMemberId: memberId,
    categoryHref: "/news",
    status: "approved",
    publishedAt: {
      not: null,
      gte: range.start,
      lt: range.end,
    },
  };
}

export function buildMonthlyNewsSubcategorySummary(
  groups: Array<{ subHref: string | null; _count: { _all: number } }>
) {
  const counts = new Map(groups.map((group) => [group.subHref, group._count._all]));
  return NEWS_SUBCATEGORY_OPTIONS.map((subcategory) => ({
    href: subcategory.href,
    name: subcategory.label,
    count: counts.get(subcategory.href) ?? 0,
  }));
}

export function getMonthlyNewsPagination(page: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / DIFAN_MONTHLY_NEWS_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(page)));
  return {
    page: safePage,
    pageSize: DIFAN_MONTHLY_NEWS_PAGE_SIZE,
    total,
    totalPages,
    skip: (safePage - 1) * DIFAN_MONTHLY_NEWS_PAGE_SIZE,
  };
}
