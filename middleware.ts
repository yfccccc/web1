import { NextRequest, NextResponse } from "next/server";
import dictionaryLegacyAliasMap from "@/scripts/output/dictionary-legacy-alias-map.json";

const LEGACY_SITE_URL = "https://jiu.cnzhengmu.com";
const WWW_HOST = "www.cnzhengmu.com";
const PRIMARY_HOST = "cnzhengmu.com";
const DICTIONARY_LEGACY_ALIAS_MAP = dictionaryLegacyAliasMap as Record<string, string>;

const SHOW_ROUTE_MAP: Record<string, (id: string) => string> = {
  news: (id) => `/news/${encodeURIComponent(id)}`,
  product: (id) => `/product/${encodeURIComponent(id)}`,
  download: (id) => `/download/${encodeURIComponent(id)}`,
};

function isValidId(value: string | null) {
  return !!value && /^[0-9A-Za-z_-]+$/.test(value);
}

function decodePathname(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export function middleware(request: NextRequest) {
  const { nextUrl } = request;

  const dictionaryAliasTarget = DICTIONARY_LEGACY_ALIAS_MAP[decodePathname(nextUrl.pathname)];
  if (dictionaryAliasTarget) {
    return NextResponse.redirect(new URL(dictionaryAliasTarget, `https://${PRIMARY_HOST}`), 301);
  }

  if (nextUrl.hostname === WWW_HOST) {
    const target = nextUrl.clone();
    target.protocol = "https:";
    target.hostname = PRIMARY_HOST;
    target.port = "";
    return NextResponse.redirect(target, 301);
  }

  if (nextUrl.pathname !== "/index.php") {
    return NextResponse.next();
  }

  const m = nextUrl.searchParams.get("m")?.trim().toLowerCase() ?? "";
  const c = nextUrl.searchParams.get("c")?.trim().toLowerCase() ?? "";
  const id = nextUrl.searchParams.get("id")?.trim() ?? "";

  if (m === "news" && c === "shows" && isValidId(id)) {
    const target = new URL(`${LEGACY_SITE_URL}/index.php`);
    nextUrl.searchParams.forEach((value, key) => {
      target.searchParams.append(key, value);
    });
    return NextResponse.redirect(target, 301);
  }

  if (c === "shows" && isValidId(id) && SHOW_ROUTE_MAP[m]) {
    const target = new URL(SHOW_ROUTE_MAP[m](id), nextUrl.origin);
    return NextResponse.redirect(target, 301);
  }

  // For any other legacy index.php query forms, keep them alive on the old site
  // instead of letting the new site return a 404.
  const fallback = new URL(`${LEGACY_SITE_URL}/index.php`);
  nextUrl.searchParams.forEach((value, key) => {
    fallback.searchParams.append(key, value);
  });
  return NextResponse.redirect(fallback, 301);
}

export const config = {
  matcher: ["/index.php", "/((?!_next|.*\\..*).*)", "/:path*.html"],
};
