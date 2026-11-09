import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const articleOrderByPinnedLatest: Prisma.ArticleOrderByWithRelationInput[] = [
  { isPinned: "desc" },
  { publishedAt: "desc" },
  { updatedAt: "desc" },
  { id: "desc" },
];

export const articleOrderByPinnedOldest: Prisma.ArticleOrderByWithRelationInput[] = [
  { isPinned: "desc" },
  { publishedAt: "asc" },
  { updatedAt: "asc" },
  { id: "asc" },
];

export const articleOrderByPinnedPopular: Prisma.ArticleOrderByWithRelationInput[] = [
  { isPinned: "desc" },
  { viewCount: "desc" },
  { publishedAt: "desc" },
  { updatedAt: "desc" },
  { id: "desc" },
];

export async function getLatestPublishedArticles(limit = 6) {
  return prisma.article.findMany({
    where: {
      status: "approved",
      publishedAt: { not: null },
    },
    orderBy: articleOrderByPinnedLatest,
    take: Math.max(1, Math.min(limit, 20)),
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      publishedAt: true,
      updatedAt: true,
      subHref: true,
    },
  });
}

export async function getPublishedBuyingArticles(limit = 12) {
  return prisma.article.findMany({
    where: {
      status: "approved",
      publishedAt: { not: null },
      OR: [{ categoryHref: { startsWith: "/brands/buying" } }, { subHref: { startsWith: "/brands/buying" } }],
    },
    orderBy: articleOrderByPinnedLatest,
    take: Math.max(1, Math.min(limit, 24)),
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      coverImage: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
}
