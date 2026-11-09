import type { Metadata } from "next";
import { PUBLIC_SITE_URL } from "@/lib/public-site-config";

const FALLBACK_SITE_URL = PUBLIC_SITE_URL;

function isPrivateHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") return true;
  if (normalized.endsWith(".local")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) return true;
  if (normalized.includes(":") && !normalized.includes(".")) return true;
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  return false;
}

function resolveConfiguredSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return FALLBACK_SITE_URL;
  try {
    const parsed = new URL(configured);
    if (isPrivateHostname(parsed.hostname)) {
      const databaseName = (() => {
        try {
          return new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "");
        } catch {
          return "";
        }
      })();
      const allowIsolatedTestSite =
        process.env.RICH_TEXT_TEST_MODE === "1" &&
        databaseName.endsWith("_test") &&
        databaseName !== "web1";
      return allowIsolatedTestSite ? parsed.origin : FALLBACK_SITE_URL;
    }
    return parsed.origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export const SITE_NAME = "整木网";
export const SHARE_SITE_NAME = "中华整木网";
export const SITE_TITLE = `${SITE_NAME} | 整体木作行业知识共享平台`;
export const SITE_DESCRIPTION =
  "整木网是整体木作行业知识共享平台，覆盖整木资讯、整木市场、整木词库、整木标准与整木评选。";

export function normalizeShareTitle(title: string) {
  return title.replace(/整木网/g, SHARE_SITE_NAME);
}

export function getSiteUrl() {
  return resolveConfiguredSiteUrl();
}

export function absoluteUrl(path = "/") {
  return new URL(path, getSiteUrl()).toString();
}

type PageMetadataOptions = {
  title: string;
  description: string;
  path?: string;
  type?: "website" | "article";
  keywords?: string[];
  siteName?: string;
  image?: string | null;
  imageAlt?: string;
  absoluteTitle?: boolean;
};

type ComposeIntentTitleOptions = {
  keyword: string;
  suffix: string;
  maxLength?: number;
};

function normalizeTitleKeyword(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function clipTitleKeyword(keyword: string, maxLength: number) {
  const normalized = normalizeTitleKeyword(keyword);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, Math.max(0, maxLength)).trim();
}

export function composeIntentTitle({ keyword, suffix, maxLength = 32 }: ComposeIntentTitleOptions) {
  const normalizedSuffix = suffix.trim();
  if (!normalizedSuffix) return normalizeTitleKeyword(keyword);

  const maxKeywordLength = Math.max(1, maxLength - normalizedSuffix.length);
  const clippedKeyword = clipTitleKeyword(keyword, maxKeywordLength);
  return `${clippedKeyword}${normalizedSuffix}`;
}

export function buildPageMetadata({
  title,
  description,
  path = "/",
  type = "website",
  keywords,
  siteName = SITE_NAME,
  image,
  imageAlt,
  absoluteTitle = false,
}: PageMetadataOptions): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = image ? absoluteUrl(image) : undefined;
  const shareTitle = normalizeShareTitle(title);

  return {
    title: absoluteTitle ? { absolute: shareTitle } : shareTitle,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      title: shareTitle,
      description,
      url,
      siteName,
      locale: "zh_CN",
      type,
      images: imageUrl ? [{ url: imageUrl, alt: imageAlt ?? shareTitle }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export function buildNoIndexMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
  };
}
