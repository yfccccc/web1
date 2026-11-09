export type BrandPublicUrlInput = {
  slug: string;
  enterpriseId?: string | null;
};

const LEGACY_BRAND_ENTERPRISE_IDS: Readonly<Record<string, string>> = {
  "康倍得": "cmneeb058000ljkj5ahdha04m",
  "brand-1775145531410": "cmneeb058000ljkj5ahdha04m",
  "铂品系统家居": "cmn5mtfem00n9aenpd3j8sgmo",
  "legacy-brand-53947937": "cmn5mtfem00n9aenpd3j8sgmo",
};

export function safeDecodeUrlSegment(rawValue: string, maxDepth = 2) {
  let value = (rawValue || "").trim();

  for (let depth = 0; depth < maxDepth; depth += 1) {
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

export function getLegacyBrandEnterpriseId(rawSlug: string) {
  return LEGACY_BRAND_ENTERPRISE_IDS[safeDecodeUrlSegment(rawSlug)] ?? null;
}

export function buildBrandPublicUrl({ slug, enterpriseId }: BrandPublicUrlInput) {
  const normalizedSlug = safeDecodeUrlSegment(slug);
  const resolvedEnterpriseId = enterpriseId?.trim() || getLegacyBrandEnterpriseId(normalizedSlug);

  if (resolvedEnterpriseId) {
    return `/enterprise/${encodeURIComponent(resolvedEnterpriseId)}`;
  }

  return `/brands/${encodeURIComponent(normalizedSlug)}`;
}
