import { articleOrderByPinnedLatest } from "@/lib/articles";
import { prisma } from "@/lib/prisma";
import { resolveUploadedImageShareUrl } from "@/lib/uploaded-image";
import type { Prisma } from "@prisma/client";
import { buildPublishedNewsWhere } from "@/lib/news-listing";

export const DEFAULT_NEWS_SHARE_IMAGE = "/api/og/news-default";

export function normalizeNewsSegment(raw: string) {
  let value = (raw || "").trim();
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  return value.trim();
}

function buildNewsSegmentCandidates(segment: string) {
  const normalized = normalizeNewsSegment(segment).replace(/\.html$/i, "").trim();
  return normalized ? [normalized] : [];
}

export async function findNewsArticleBySegment(segment: string) {
  const candidates = buildNewsSegmentCandidates(segment);
  if (candidates.length === 0) return null;

  const baseWhere: Prisma.ArticleWhereInput = buildPublishedNewsWhere();

  const exactMatch = await prisma.article.findFirst({
    where: {
      ...baseWhere,
      AND: [
        {
          OR: candidates.flatMap((candidate) => [{ id: candidate }, { slug: candidate }, { title: candidate }]),
        },
      ],
    },
    orderBy: articleOrderByPinnedLatest,
  });

  if (exactMatch) return exactMatch;
  return null;
}

export function extractFirstContentImage(html: string | null | undefined) {
  if (!html) return "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || "";
}

export function resolveArticleShareImage(article: { coverImage?: string | null; content?: string | null }) {
  const candidates = [
    resolveUploadedImageShareUrl(article.coverImage),
    resolveUploadedImageShareUrl(extractFirstContentImage(article.content)),
    DEFAULT_NEWS_SHARE_IMAGE,
  ];

  return candidates.find((value) => Boolean(value && value.trim())) || DEFAULT_NEWS_SHARE_IMAGE;
}
