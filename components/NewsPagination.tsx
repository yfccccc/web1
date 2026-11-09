import Link from "next/link";

type Props = {
  baseHref: string;
  page: number;
  totalPages: number;
};

function visiblePages(page: number, totalPages: number) {
  const values = new Set([1, totalPages]);
  for (let value = page - 2; value <= page + 2; value += 1) {
    if (value >= 1 && value <= totalPages) values.add(value);
  }
  return Array.from(values).sort((a, b) => a - b);
}

export function NewsPagination({ baseHref, page, totalPages }: Props) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(safeTotalPages, Math.max(1, page));
  const pages = visiblePages(safePage, safeTotalPages);
  const href = (targetPage: number) =>
    targetPage <= 1 ? baseHref : `${baseHref}?page=${targetPage}`;

  return (
    <nav className="mt-6 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="资讯栏目分页">
      <span className="text-muted">第 {safePage} / {safeTotalPages} 页</span>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(1)} aria-disabled={safePage <= 1} className={`rounded-full border border-border px-3.5 py-2 ${safePage <= 1 ? "pointer-events-none text-muted opacity-50" : "text-primary hover:bg-surface"}`}>首页</Link>
        <Link href={href(Math.max(1, safePage - 1))} aria-disabled={safePage <= 1} className={`rounded-full border border-border px-3.5 py-2 ${safePage <= 1 ? "pointer-events-none text-muted opacity-50" : "text-primary hover:bg-surface"}`}>上一页</Link>
        {pages.map((value, index) => {
          const previous = pages[index - 1];
          return (
            <span key={value} className="contents">
              {previous && value - previous > 1 ? <span className="px-1 text-muted">…</span> : null}
              <Link
                href={href(value)}
                aria-current={value === safePage ? "page" : undefined}
                className={`min-w-10 rounded-full border px-3 py-2 text-center ${value === safePage ? "border-accent bg-accent text-white" : "border-border text-primary hover:bg-surface"}`}
              >
                {value}
              </Link>
            </span>
          );
        })}
        <Link href={href(Math.min(safeTotalPages, safePage + 1))} aria-disabled={safePage >= safeTotalPages} className={`rounded-full border border-border px-3.5 py-2 ${safePage >= safeTotalPages ? "pointer-events-none text-muted opacity-50" : "text-primary hover:bg-surface"}`}>下一页</Link>
        <Link href={href(safeTotalPages)} aria-disabled={safePage >= safeTotalPages} className={`rounded-full border border-border px-3.5 py-2 ${safePage >= safeTotalPages ? "pointer-events-none text-muted opacity-50" : "text-primary hover:bg-surface"}`}>末页</Link>
      </div>
    </nav>
  );
}
