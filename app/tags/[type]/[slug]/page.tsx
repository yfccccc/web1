import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildPageMetadata } from "@/lib/seo";
import { buildNewsPath } from "@/lib/share-config";
import { buildPublishedNewsWhere } from "@/lib/news-listing";

export const revalidate = 300;

const TAG_TYPES: Record<string, string> = {
  industry: "行业标签",
  tech: "技术标签",
  style: "风格标签",
  region: "区域标签",
  level: "等级标签",
};

type Props = { params: Promise<{ type: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, slug } = await params;
  const tag = await prisma.tag.findFirst({ where: { type, slug } });
  if (!tag) return { title: "标签" };

  return buildPageMetadata({
    title: `${tag.label} | ${TAG_TYPES[type] ?? type}`,
    description: `带「${tag.label}」标签的整木资讯与内容。`,
    path: `/tags/${type}/${slug}`,
  });
}

export default async function TagSlugPage({ params }: Props) {
  const { type, slug } = await params;
  if (!TAG_TYPES[type]) notFound();
  const tag = await prisma.tag.findFirst({
    where: { type, slug },
    include: {
      articles: {
        where: { article: { is: { AND: [buildPublishedNewsWhere(), { publishedAt: { not: null } }] } } },
        include: { article: true },
        orderBy: [{ article: { isPinned: "desc" } }, { article: { publishedAt: "desc" } }, { article: { id: "desc" } }],
        take: 100,
      },
    },
  });
  if (!tag) notFound();

  const articles = tag.articles
    .map((a) => a.article)
    .filter((a) => a.id && a.slug.trim() && a.title.trim());

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <nav className="mb-6" aria-label="面包屑">
        <Link href="/" className="text-sm text-muted hover:text-accent">首页</Link>
        <span className="text-muted mx-2">/</span>
        <Link href="/tags" className="text-sm text-muted hover:text-accent">标签</Link>
        <span className="text-muted mx-2">/</span>
        <span className="text-primary font-medium">{tag.label}</span>
      </nav>
      <h1 className="font-serif text-2xl font-bold text-primary mb-2">{tag.label}</h1>
      <p className="text-sm text-muted mb-6">{TAG_TYPES[type]} · 共 {articles.length} 篇资讯</p>
      {articles.length > 0 ? (
        <ul className="space-y-3">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={buildNewsPath(a.slug || a.id)}
                className="text-primary font-medium transition-colors hover:text-accent"
              >
                {a.title}
              </Link>
              {a.publishedAt && (
                <span className="text-xs text-muted ml-2">
                  {new Date(a.publishedAt).toLocaleDateString("zh-CN")}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">暂无带此标签的已发布资讯。</p>
      )}
    </div>
  );
}
