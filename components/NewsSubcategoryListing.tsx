import Link from "next/link";
import { buildNewsPath, getArticleSegment } from "@/lib/share-config";
import { decodeEscapedUnicode } from "@/lib/text";
import { NewsPagination } from "@/components/NewsPagination";
import {
  getPublishedNewsSubcategoryPage,
  NEWS_SUBCATEGORIES,
  type NewsSubcategorySlug,
} from "@/lib/news-listing";

type Props = {
  slug: NewsSubcategorySlug;
  page?: string;
};

export async function NewsSubcategoryListing({ slug, page: pageParam }: Props) {
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const result = await getPublishedNewsSubcategoryPage(slug, requestedPage);
  if (!result) return null;

  const { subcategory, items, total, totalPages, page } = result;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <nav className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted" aria-label="面包屑">
        <Link href="/" className="hover:text-accent">首页</Link>
        <span>/</span>
        <Link href="/news" className="hover:text-accent">整木资讯</Link>
        <span>/</span>
        <span className="text-primary">{subcategory.title}</span>
      </nav>

      <section className="glass-panel relative overflow-hidden p-5 sm:p-7 lg:p-9">
        <div className="relative max-w-3xl">
          <h1 className="font-serif text-[2rem] font-semibold tracking-[-0.02em] text-primary sm:text-[2.7rem] lg:text-[3.3rem]">
            {subcategory.title}
          </h1>
          <p className="mt-3 max-w-[46rem] text-[15px] leading-8 text-muted">{subcategory.description}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted">共 {total} 篇已发布资讯</span>
            <Link
              href={`/news/all?sub=${encodeURIComponent(subcategory.href)}&search=1`}
              className="rounded-full border border-border bg-white/80 px-5 py-2.5 text-sm font-medium text-primary hover:text-accent"
            >
              搜索本栏目
            </Link>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-2.5 border-t border-border pt-5">
          {NEWS_SUBCATEGORIES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full border px-3.5 py-2 text-sm ${item.slug === slug ? "border-accent bg-white text-accent" : "border-border bg-white/72 text-muted hover:text-primary"}`}
            >
              {item.title}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[28px] border border-border bg-[rgba(255,255,255,0.82)] p-5 sm:p-6">
        {items.length === 0 ? (
          <p className="text-sm text-muted">当前栏目还没有已发布内容。</p>
        ) : (
          <ul className="grid gap-4">
            {items.map((item) => (
              <li key={item.id} className="rounded-[22px] border border-border bg-surface-elevated p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span>{subcategory.title}</span>
                  <span>{(item.publishedAt ?? item.updatedAt).toLocaleDateString("zh-CN")}</span>
                </div>
                <Link href={buildNewsPath(getArticleSegment(item))} className="mt-3 block text-[1.05rem] font-medium leading-8 text-primary hover:text-accent">
                  {decodeEscapedUnicode(item.title)}
                </Link>
                {item.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-7 text-muted">{decodeEscapedUnicode(item.excerpt)}</p> : null}
              </li>
            ))}
          </ul>
        )}

        <NewsPagination baseHref={subcategory.href} page={page} totalPages={totalPages} />
      </section>
    </div>
  );
}
