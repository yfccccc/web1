import { getSiteUrl } from "./seo";

const FALLBACK_SHARE_VERSION = "mobile-share-20260329-1";
export const DEFAULT_DICTIONARY_SHARE_IMAGE = "/images/dictionary-share-default.png";

export function buildNewsPath(segment: string) {
  return `/news/${encodeURIComponent(segment)}`;
}

export function buildBuyingPath(segment: string) {
  return `/brands/buying/${encodeURIComponent(segment)}`;
}

export function getArticleSegment(article: { id: string; slug?: string | null }) {
  const slug = article.slug?.trim();
  return slug || article.id;
}

export function buildDictionaryPath(segment: string) {
  return `/dictionary/${encodeURIComponent(segment)}`;
}

export function buildPublicNewsUrl(segment: string) {
  return `${getSiteUrl()}${buildNewsPath(segment)}`;
}

export function buildPublicBuyingUrl(segment: string) {
  return `${getSiteUrl()}${buildBuyingPath(segment)}`;
}

export function buildPublicDictionaryUrl(segment: string) {
  return `${getSiteUrl()}${buildDictionaryPath(segment)}`;
}

export function buildArticleShareVersion(value: string | number | Date | null | undefined) {
  if (value instanceof Date) {
    return `article-${value.getTime()}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `article-${Math.trunc(value)}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return FALLBACK_SHARE_VERSION;

    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) {
      return `article-${timestamp}`;
    }

    return `article-${trimmed.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "v1"}`;
  }

  return FALLBACK_SHARE_VERSION;
}

export function buildNewsShareEntryUrl(segment: string, shareVersion?: string | null) {
  void shareVersion;
  return buildPublicNewsUrl(segment);
}
