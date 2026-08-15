"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SummaryData = {
  month: string;
  monthLabel: string;
  total: number;
  categories: Array<{ href: string; name: string; count: number }>;
  items: Array<{
    id: string;
    title: string;
    href: string;
    subHref: string | null;
    subcategoryName: string;
    publishedAt: string | null;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function getCurrentShanghaiMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatPublishedDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function DifanMonthlyNewsSummary() {
  const currentMonth = useMemo(() => getCurrentShanghaiMonth(), []);
  const [month, setMonth] = useState(currentMonth);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetch(`/api/member/monthly-news-summary?month=${encodeURIComponent(month)}&page=${page}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "月度资讯汇总加载失败");
        return body as SummaryData;
      })
      .then((body) => setSummary(body))
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "月度资讯汇总加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [month, page]);

  const changeMonth = (delta: number) => {
    const nextMonth = shiftMonth(month, delta);
    if (nextMonth > currentMonth) return;
    setMonth(nextMonth);
    setPage(1);
  };

  const totalPages = summary?.pagination.totalPages ?? 1;

  return (
    <section
      id="monthly-news-summary"
      data-testid="difan-monthly-news-summary"
      className="rounded-[24px] border border-border bg-surface-elevated p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-5 sm:shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">月度资讯发布汇总</h2>
          <p className="mt-1 text-sm text-muted">{summary?.monthLabel ?? `${month.slice(0, 4)}年${Number(month.slice(5))}月`}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-primary transition hover:bg-white"
          >
            上一个月
          </button>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            disabled={month >= currentMonth}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-primary transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一个月
          </button>
        </div>
      </div>

      {error ? <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className={`mt-4 space-y-4 transition-opacity ${loading ? "opacity-55" : "opacity-100"}`} aria-busy={loading}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
          <div className="rounded-[20px] border border-[rgba(180,154,107,0.24)] bg-[linear-gradient(135deg,rgba(255,249,238,0.98),rgba(244,239,230,0.82))] px-4 py-4 sm:px-5 sm:py-4">
            <p className="text-xs text-muted sm:text-sm">本月已发布资讯</p>
            <p className="mt-1 font-serif text-3xl font-semibold text-primary sm:text-4xl">
              {summary?.total ?? 0}<span className="ml-2 text-sm font-normal text-muted sm:text-base">篇</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {(summary?.categories ?? []).map((category) => (
              <div key={category.href} className="rounded-[18px] border border-border bg-surface px-3 py-3 sm:px-4 sm:py-3">
                <p className="truncate text-xs text-muted" title={category.name}>{category.name}</p>
                <p className="mt-1 text-xl font-semibold text-primary">{category.count}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-primary">本月已发布内容</h3>
              <p className="mt-1 text-xs text-muted">按发布日期从新到旧排列，每页 50 条。</p>
            </div>
            {summary ? <span className="text-xs text-muted">第 {summary.pagination.page} / {summary.pagination.totalPages} 页</span> : null}
          </div>

          {!loading && summary?.items.length === 0 ? (
            <div className="mt-3 rounded-[18px] border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
              本月暂无已发布资讯
            </div>
          ) : (
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-white/85">
              {(summary?.items ?? []).map((item) => (
                <div key={item.id} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[64px_96px_minmax(0,1fr)] sm:items-center sm:gap-3 sm:px-4">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted sm:contents">
                    <time className="shrink-0" dateTime={item.publishedAt ?? undefined}>{formatPublishedDate(item.publishedAt)}</time>
                    <span className="text-border sm:hidden" aria-hidden="true">·</span>
                    <span className="min-w-0 truncate">{item.subcategoryName}</span>
                  </div>
                  <Link href={item.href} className="line-clamp-2 min-w-0 text-sm leading-5 text-primary transition hover:text-accent sm:truncate sm:leading-6" title={item.title}>
                    {item.title}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-full border border-border px-4 py-2 text-sm text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className="rounded-full border border-border px-4 py-2 text-sm text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
