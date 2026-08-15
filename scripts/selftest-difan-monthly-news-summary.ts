import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DIFAN_MONTHLY_NEWS_PAGE_SIZE,
  DIFAN_MONTHLY_NEWS_SUMMARY_MEMBER_ID,
  MONTHLY_NEWS_TIME_ZONE,
  buildDifanMonthlyNewsWhere,
  buildMonthlyNewsSubcategorySummary,
  getCurrentShanghaiMonth,
  getMonthlyNewsPagination,
  isDifanMonthlyNewsSummaryEnabled,
  parseShanghaiMonth,
} from "../lib/difan-monthly-news-summary";

assert.equal(DIFAN_MONTHLY_NEWS_SUMMARY_MEMBER_ID, "cmq0aj24d00c012ug20mbbnzo");
assert.equal(MONTHLY_NEWS_TIME_ZONE, "Asia/Shanghai");
assert.equal(DIFAN_MONTHLY_NEWS_PAGE_SIZE, 50);
assert.equal(isDifanMonthlyNewsSummaryEnabled(DIFAN_MONTHLY_NEWS_SUMMARY_MEMBER_ID), true);
assert.equal(isDifanMonthlyNewsSummaryEnabled("other-enterprise-basic"), false);
assert.equal(isDifanMonthlyNewsSummaryEnabled("other-enterprise-advanced"), false);
assert.equal(isDifanMonthlyNewsSummaryEnabled("other-personal"), false);
assert.equal(getCurrentShanghaiMonth(new Date("2026-08-31T16:00:00.000Z")), "2026-09");

const parsedAugust = parseShanghaiMonth("2026-08", new Date("2026-08-15T12:00:00.000Z"));
assert.equal(parsedAugust.ok, true);
if (!parsedAugust.ok) throw new Error("2026-08 should be a valid Shanghai month");
assert.equal(parsedAugust.range.label, "2026年8月");
assert.equal(parsedAugust.range.start.toISOString(), "2026-07-31T16:00:00.000Z");
assert.equal(parsedAugust.range.end.toISOString(), "2026-08-31T16:00:00.000Z");
assert.deepEqual(parseShanghaiMonth("2026-09", new Date("2026-08-15T12:00:00.000Z")), {
  ok: false,
  reason: "future",
});
assert.deepEqual(parseShanghaiMonth("2026-13"), { ok: false, reason: "invalid" });
assert.deepEqual(parseShanghaiMonth("bad-month"), { ok: false, reason: "invalid" });

const where = buildDifanMonthlyNewsWhere(DIFAN_MONTHLY_NEWS_SUMMARY_MEMBER_ID, parsedAugust.range);
assert.equal(where.authorMemberId, DIFAN_MONTHLY_NEWS_SUMMARY_MEMBER_ID);
assert.equal(where.categoryHref, "/news");
assert.equal(where.status, "approved");
assert.deepEqual(where.publishedAt, {
  not: null,
  gte: parsedAugust.range.start,
  lt: parsedAugust.range.end,
});

type ArticleFixture = {
  authorMemberId: string;
  categoryHref: string;
  status: string;
  publishedAt: Date | null;
};

function matchesMonthlyWhere(article: ArticleFixture) {
  return (
    article.authorMemberId === where.authorMemberId &&
    article.categoryHref === where.categoryHref &&
    article.status === where.status &&
    article.publishedAt != null &&
    article.publishedAt >= parsedAugust.range.start &&
    article.publishedAt < parsedAugust.range.end
  );
}

const included = (publishedAt: string): ArticleFixture => ({
  authorMemberId: DIFAN_MONTHLY_NEWS_SUMMARY_MEMBER_ID,
  categoryHref: "/news",
  status: "approved",
  publishedAt: new Date(publishedAt),
});

assert.equal(matchesMonthlyWhere(included("2026-07-31T16:00:00.000Z")), true);
assert.equal(matchesMonthlyWhere(included("2026-08-31T15:59:59.999Z")), true);
assert.equal(matchesMonthlyWhere(included("2026-07-31T15:59:59.999Z")), false);
assert.equal(matchesMonthlyWhere(included("2026-08-31T16:00:00.000Z")), false);
assert.equal(matchesMonthlyWhere({ ...included("2026-08-15T00:00:00.000Z"), status: "draft" }), false);
assert.equal(matchesMonthlyWhere({ ...included("2026-08-15T00:00:00.000Z"), status: "pending" }), false);
assert.equal(matchesMonthlyWhere({ ...included("2026-08-15T00:00:00.000Z"), status: "rejected" }), false);
assert.equal(matchesMonthlyWhere({ ...included("2026-08-15T00:00:00.000Z"), categoryHref: "/dictionary" }), false);
assert.equal(matchesMonthlyWhere({ ...included("2026-08-15T00:00:00.000Z"), categoryHref: "/standards" }), false);
assert.equal(matchesMonthlyWhere({ ...included("2026-08-15T00:00:00.000Z"), categoryHref: "/brands" }), false);
assert.equal(matchesMonthlyWhere({ ...included("2026-08-15T00:00:00.000Z"), publishedAt: null }), false);
assert.equal(matchesMonthlyWhere({ ...included("2026-08-15T00:00:00.000Z"), authorMemberId: "another-member" }), false);

const categorySummary = buildMonthlyNewsSubcategorySummary([
  { subHref: "/news/enterprise", _count: { _all: 20 } },
  { subHref: "/news/trends", _count: { _all: 5 } },
  { subHref: "/news/tech", _count: { _all: 4 } },
  { subHref: "/news/events", _count: { _all: 3 } },
]);
assert.equal(categorySummary.length, 4);
assert.equal(categorySummary.reduce((sum, category) => sum + category.count, 0), 32);
assert.deepEqual(categorySummary.map((category) => [category.href, category.count]), [
  ["/news/trends", 5],
  ["/news/enterprise", 20],
  ["/news/tech", 4],
  ["/news/events", 3],
]);
const emptyCategorySummary = buildMonthlyNewsSubcategorySummary([]);
assert.equal(emptyCategorySummary.every((category) => category.count === 0), true);

assert.deepEqual(getMonthlyNewsPagination(2, 120), {
  page: 2,
  pageSize: 50,
  total: 120,
  totalPages: 3,
  skip: 50,
});
assert.deepEqual(getMonthlyNewsPagination(9, 0), {
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
  skip: 0,
});

const apiRoute = readFileSync(resolve(process.cwd(), "app/api/member/monthly-news-summary/route.ts"), "utf8");
const dashboardRoute = readFileSync(resolve(process.cwd(), "app/api/member/dashboard/route.ts"), "utf8");
const contentPage = readFileSync(resolve(process.cwd(), "app/membership/content/page.tsx"), "utf8");
const summaryComponent = readFileSync(resolve(process.cwd(), "components/member/DifanMonthlyNewsSummary.tsx"), "utf8");
const publicMembershipPage = readFileSync(resolve(process.cwd(), "app/membership/page.tsx"), "utf8");
const helperSource = readFileSync(resolve(process.cwd(), "lib/difan-monthly-news-summary.ts"), "utf8");

assert.match(apiRoute, /const session = await getSession\(\)/);
assert.match(apiRoute, /isDifanMonthlyNewsSummaryEnabled\(session\.sub\)/);
assert.match(apiRoute, /status: 403/);
assert(apiRoute.indexOf("isDifanMonthlyNewsSummaryEnabled(session.sub)") < apiRoute.indexOf("prisma.article.count"));
assert.match(apiRoute, /prisma\.article\.count/);
assert.match(apiRoute, /prisma\.article\.groupBy/);
assert.match(apiRoute, /prisma\.article\.findMany/);
assert.match(apiRoute, /orderBy: \[\{ publishedAt: "desc" \}/);
assert.doesNotMatch(apiRoute, /ArticleChangeRequest|articleChangeRequest|GalleryImage|StandardFeedback/);
assert.match(dashboardRoute, /monthlyNewsSummary: isDifanMonthlyNewsSummaryEnabled\(session\.sub\)/);
assert.match(contentPage, /data\.features\.monthlyNewsSummary \? <DifanMonthlyNewsSummary \/>/);
assert.match(contentPage, /data\.features\.monthlyNewsSummary \? <AnchorLink href="#monthly-news-summary"/);
assert.match(summaryComponent, /\/api\/member\/monthly-news-summary\?month=/);
assert.match(summaryComponent, /disabled=\{month >= currentMonth\}/);
assert.match(summaryComponent, /本月暂无已发布资讯/);
assert.match(summaryComponent, /每页 50 条/);
assert.doesNotMatch(publicMembershipPage, /月度资讯发布汇总/);
assert.doesNotMatch(helperSource, /email|companyName|phone/);

console.log("difan monthly news summary self-test passed (fixture total: 32)");
