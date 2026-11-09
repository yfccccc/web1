"use client";

type AdminPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  currentCount?: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

function visiblePages(page: number, totalPages: number) {
  const pages = new Set([1, totalPages]);
  for (let value = page - 2; value <= page + 2; value += 1) {
    if (value >= 1 && value <= totalPages) pages.add(value);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

export function AdminPagination({
  page,
  totalPages,
  total,
  pageSize = 20,
  currentCount,
  loading = false,
  onPageChange,
}: AdminPaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(safeTotalPages, Math.max(1, page));
  const pages = visiblePages(safePage, safeTotalPages);

  const go = (nextPage: number) => {
    if (loading) return;
    onPageChange(Math.min(safeTotalPages, Math.max(1, nextPage)));
  };

  return (
    <nav className="flex flex-col gap-3 rounded-[20px] border border-border bg-white/75 px-4 py-3 text-sm lg:flex-row lg:items-center lg:justify-between" aria-label="列表分页">
      <span className="text-muted">
        共 <span className="font-semibold text-primary">{total}</span> 条 · 第 {safePage} / {safeTotalPages} 页
        {typeof currentCount === "number" ? ` · 本页 ${currentCount} 条` : ""} · 每页 {pageSize} 条
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={safePage <= 1 || loading} onClick={() => go(1)} className="rounded-full border border-border px-3.5 py-2 text-primary disabled:cursor-not-allowed disabled:opacity-40">首页</button>
        <button type="button" disabled={safePage <= 1 || loading} onClick={() => go(safePage - 1)} className="rounded-full border border-border px-3.5 py-2 text-primary disabled:cursor-not-allowed disabled:opacity-40">上一页</button>
        {pages.map((value, index) => {
          const previous = pages[index - 1];
          return (
            <span key={value} className="contents">
              {previous && value - previous > 1 ? <span className="px-1 text-muted">…</span> : null}
              <button
                type="button"
                aria-current={value === safePage ? "page" : undefined}
                disabled={loading}
                onClick={() => go(value)}
                className={`min-w-10 rounded-full border px-3 py-2 ${value === safePage ? "border-accent bg-accent text-white" : "border-border text-primary hover:bg-surface"}`}
              >
                {value}
              </button>
            </span>
          );
        })}
        <button type="button" disabled={safePage >= safeTotalPages || loading} onClick={() => go(safePage + 1)} className="rounded-full border border-border px-3.5 py-2 text-primary disabled:cursor-not-allowed disabled:opacity-40">下一页</button>
        <button type="button" disabled={safePage >= safeTotalPages || loading} onClick={() => go(safeTotalPages)} className="rounded-full border border-border px-3.5 py-2 text-primary disabled:cursor-not-allowed disabled:opacity-40">末页</button>
      </div>
    </nav>
  );
}
