export const PENDING_BRAND_GENERATION_ENABLED = true;

export function applyPendingBrandPolicy<TKeyword, TPendingBrand>(input: {
  keywords: TKeyword[];
  pendingBrandCandidates: TPendingBrand[];
}) {
  return {
    keywords: input.keywords,
    pendingBrands: PENDING_BRAND_GENERATION_ENABLED ? input.pendingBrandCandidates : [],
  };
}
