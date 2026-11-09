export type ImportedDocumentMetadata = {
  title: string;
  titleSource?: string;
  summary: string;
  keywords: string;
  legacyKeywordMismatch: boolean;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeImportedKeywordsForForm(value: unknown) {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of asTrimmedString(value).split(/[，,、;；\n]+/)) {
    const keyword = raw.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
    if (keywords.length === 5) break;
  }
  return keywords.join(",");
}

export function readImportedDocumentMetadata(payload: unknown): ImportedDocumentMetadata {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    title: asTrimmedString(source.title),
    titleSource: asTrimmedString(source.titleSource) || undefined,
    summary: asTrimmedString(source.summary) || asTrimmedString(source.excerpt),
    keywords: normalizeImportedKeywordsForForm(source.keywords),
    legacyKeywordMismatch: source.legacyKeywordMismatch === true,
  };
}
