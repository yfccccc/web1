import { cleanEntityName, hasIllegalEntityAffix, keywordIdentity } from "./news-keyword-rules";

export type StoredKeywordChange = { before: string; after: string; reason: "illegal-affix" };
export type StoredKeywordReview = { word: string; reason: "ambiguous-or-invalid-remainder" };

/** No extraction, body matching, whitelist admission, length pruning or containment merging. */
export function cleanStoredKeywordField(value: string | null, protectedWords: ReadonlySet<string> = new Set()) {
  const changes: StoredKeywordChange[] = [];
  const review: StoredKeywordReview[] = [];
  const after = value === null ? null : value.replace(/[^,，、;；\r\n]+/g, (segment) => {
    const word = segment.trim();
    if (!word || protectedWords.has(keywordIdentity(word)) || !hasIllegalEntityAffix(word)) return segment;
    const cleaned = cleanEntityName(word, protectedWords);
    // Never erase an ambiguous historical tag; preserve it for explicit review.
    if (!cleaned || hasIllegalEntityAffix(cleaned) && !protectedWords.has(keywordIdentity(cleaned))) {
      review.push({ word, reason: "ambiguous-or-invalid-remainder" });
      return segment;
    }
    if (cleaned === word) return segment;
    changes.push({ before: word, after: cleaned, reason: "illegal-affix" });
    return segment.replace(word, cleaned);
  });
  return { before: value, after, changed: value !== after, changes, review };
}
