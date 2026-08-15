import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { NEWS_SUBCATEGORY_OPTIONS } from "@/lib/content-taxonomy";
import {
  buildDifanMonthlyNewsWhere,
  buildMonthlyNewsSubcategorySummary,
  getCurrentShanghaiMonth,
  getMonthlyNewsPagination,
  isDifanMonthlyNewsSummaryEnabled,
  parseShanghaiMonth,
} from "@/lib/difan-monthly-news-summary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isDifanMonthlyNewsSummaryEnabled(session.sub)) {
    return NextResponse.json({ error: "当前账号未开通月度资讯发布汇总" }, { status: 403 });
  }

  const requestedMonth = request.nextUrl.searchParams.get("month")?.trim() || getCurrentShanghaiMonth();
  const parsedMonth = parseShanghaiMonth(requestedMonth);
  if (!parsedMonth.ok) {
    const error = parsedMonth.reason === "future" ? "不能查询未来月份" : "月份格式应为 YYYY-MM";
    return NextResponse.json({ error }, { status: 400 });
  }

  const rawPage = request.nextUrl.searchParams.get("page")?.trim() || "1";
  if (!/^\d+$/.test(rawPage) || Number(rawPage) < 1) {
    return NextResponse.json({ error: "页码必须是正整数" }, { status: 400 });
  }

  const where = buildDifanMonthlyNewsWhere(session.sub, parsedMonth.range);
  const [total, grouped] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.groupBy({
      by: ["subHref"],
      where,
      _count: { _all: true },
    }),
  ]);
  const pagination = getMonthlyNewsPagination(Number(rawPage), total);
  const rows = await prisma.article.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    skip: pagination.skip,
    take: pagination.pageSize,
    select: {
      id: true,
      title: true,
      slug: true,
      subHref: true,
      subCategoryLabel: true,
      publishedAt: true,
    },
  });
  const subcategoryLabels = new Map<string, string>(
    NEWS_SUBCATEGORY_OPTIONS.map((item) => [item.href, item.label])
  );

  return NextResponse.json(
    {
      month: parsedMonth.range.month,
      monthLabel: parsedMonth.range.label,
      total,
      categories: buildMonthlyNewsSubcategorySummary(grouped),
      items: rows.map((item) => ({
        id: item.id,
        title: item.title,
        href: `/news/${item.slug}`,
        subHref: item.subHref,
        subcategoryName: subcategoryLabels.get(item.subHref ?? "") ?? item.subCategoryLabel ?? "未分类",
        publishedAt: item.publishedAt?.toISOString() ?? null,
      })),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: pagination.total,
        totalPages: pagination.totalPages,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
