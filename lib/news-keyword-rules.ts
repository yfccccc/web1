import {
  NEWS_DISPLAY_KEYWORD_FORBIDDEN_PARTS,
  NEWS_ENTITY_FORBIDDEN_PARTS,
  NEWS_ENTITY_STRIP_PREFIXES,
} from "./news-keyword-config-v2";

export function hasIllegalEntityAffix(text: string): boolean {
  return NEWS_ENTITY_STRIP_PREFIXES.some((prefix) => text.startsWith(prefix)) || text.includes("担任");
}

/** Strip complete phrases first. Refuse an ambiguous 以+下 rather than cut 以. */
export function stripEntityAffixes(text: string, protectedWords: ReadonlySet<string> = new Set()): string | null {
  let word = text;
  const prefixes = [...NEWS_ENTITY_STRIP_PREFIXES].sort((a, b) => b.length - a.length);
  let previous: string;
  do {
    if (protectedWords.has(keywordIdentity(word))) return word;
    previous = word;
    if (word.startsWith("以下") && !word.startsWith("以下简称") && !word.startsWith("以下称")) return null;
    const role = word.lastIndexOf("担任");
    if (role >= 0) word = word.slice(role + 2).trim();
    else {
      const prefix = prefixes.find((item) => word.startsWith(item));
      if (prefix) word = word.slice(prefix.length).trim();
    }
  } while (word && word !== previous);
  return word;
}

/** Strict admission applies to newly extracted entities, not normal stored tags. */
export function cleanEntityName(text: string, protectedWords: ReadonlySet<string> = new Set()): string {
  const input = text.trim().replace(/^[“”‘’"'\s]+|[“”‘’"'，。！？!?\s]+$/g, "");
  const word = stripEntityAffixes(input, protectedWords);
  if (!word || !/^[\u4e00-\u9fa5]{2,8}$/.test(word)) return "";
  if (!protectedWords.has(keywordIdentity(word)) && NEWS_ENTITY_FORBIDDEN_PARTS.some((part) => word.includes(part))) return "";
  return word;
}

export function keywordIdentity(word: string): string {
  return word.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Non-overlapping matches count an occurrence once, even when aliases overlap. */
export function countKeywordOccurrences(text: string, aliases: string[]): number {
  const alternatives = Array.from(new Set(aliases.map(keywordIdentity).filter(Boolean)))
    .sort((a, b) => b.length - a.length)
    .map((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return /^[a-z0-9\s]+$/i.test(alias)
        ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`
        : escaped;
    });
  if (alternatives.length === 0) return 0;
  return Array.from(text.matchAll(new RegExp(alternatives.join("|"), "gi"))).length;
}

/** Deduplicate exact identities; containment only removes an explicitly dirty, untrusted phrase. */
export function mergeContainedKeywords<T extends { keyword: string; source?: string; isManual?: boolean }>(items: T[]): T[] {
  const unique = new Map<string, T>();
  for (const item of items) {
    const key = keywordIdentity(item.keyword);
    if (!unique.has(key)) unique.set(key, item);
  }
  const entries = Array.from(unique.entries());
  return entries
    .filter(([long, item]) => item.source === "whitelist" || item.isManual || !hasIllegalEntityAffix(item.keyword) ||
      !entries.some(([short]) => short.length < long.length && long.includes(short)))
    .map(([, item]) => item);
}

export function isDisplayNewsKeyword(word: string): boolean {
  const hanLength = (word.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  return hanLength <= 6 && !["兼", "期内", "今年", "去年", "同期", "截至"].some(prefix => word.startsWith(prefix)) &&
    !NEWS_DISPLAY_KEYWORD_FORBIDDEN_PARTS.some((part) => word.includes(part));
}

export function serializeNewsJsonLd(data: object): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
