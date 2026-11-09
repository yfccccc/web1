import { decodeHtmlEntities } from "@/lib/brand-content";
import { decodeEscapedUnicode } from "@/lib/text";

const MIN_DESCRIPTION_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 160;
const EDITORIAL_AUTHOR_NAME = "中华整木网编辑部";
const ORGANIZATION_NAME_PATTERN = /(编辑部|研究院|中心|公司|企业|集团|协会|媒体|团队|工作室|中华整木网|整木网)/;
const SENTENCE_END_PATTERN = /[。！？!?；;]/;
const COMMON_METADATA_ENTITIES: Record<string, string> = {
  hellip: "…",
  mdash: "—",
  ndash: "–",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  copy: "©",
  reg: "®",
  trade: "™",
};

export type ArticleAttributionInput = {
  displayAuthor?: string | null;
  authorMember?: {
    name?: string | null;
    memberType?: string | null;
    enterprise?: {
      companyName?: string | null;
      companyShortName?: string | null;
    } | null;
  } | null;
  ownedEnterprise?: {
    companyName?: string | null;
    companyShortName?: string | null;
  } | null;
};

export type ResolvedArticleAttribution = {
  name: string;
  schemaType: "Person" | "Organization";
  visibleLabel: "作者" | "发布编辑" | "投稿方";
  isEnterpriseSubmission: boolean;
  isEditorialFallback: boolean;
};

function decodeCommonNamedEntities(input: string) {
  return input.replace(/&([a-z][a-z0-9]+);/gi, (match, entity: string) => {
    return COMMON_METADATA_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function cleanArticleMetadataText(input: string | null | undefined) {
  let value = decodeEscapedUnicode(String(input ?? ""));

  for (let index = 0; index < 4; index += 1) {
    const decoded = decodeCommonNamedEntities(decodeHtmlEntities(value));
    if (decoded === value) break;
    value = decoded;
  }

  return value
    .replace(/&(?:amp;)*nbsp;?/gi, " ")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|section|article|blockquote|li|h[1-6]|tr)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z][a-z0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForDeduplication(input: string) {
  return input.replace(/[\s，。！？；：,.!?;:、"“”'‘’（）()【】\[\]]/g, "").toLowerCase();
}

function splitMetadataSentences(input: string) {
  return input.match(/[^。！？!?；;]+[。！？!?；;]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function joinMetadataParts(parts: string[]) {
  return parts.reduce((result, part) => {
    if (!result) return part;
    return `${result}${SENTENCE_END_PATTERN.test(result.slice(-1)) ? "" : "。"}${part}`;
  }, "");
}

function truncateMetadataText(input: string, maxLength = MAX_DESCRIPTION_LENGTH) {
  const value = cleanArticleMetadataText(input);
  if (value.length <= maxLength) return value;

  const window = value.slice(0, maxLength);
  const minimumBoundary = Math.max(MIN_DESCRIPTION_LENGTH, Math.floor(maxLength * 0.6));
  let boundary = -1;
  for (let index = window.length - 1; index >= minimumBoundary; index -= 1) {
    if (SENTENCE_END_PATTERN.test(window[index])) {
      boundary = index + 1;
      break;
    }
  }

  if (boundary > 0) return window.slice(0, boundary).trim();
  return `${window.slice(0, Math.max(1, maxLength - 1)).replace(/[，,、：:；;\s]+$/g, "").trim()}…`;
}

export function buildArticleMetadataDescription(input: {
  title: string;
  excerpt?: string | null;
  conceptSummary?: string | null;
  answerSummary?: string | null;
  content?: string | null;
}) {
  const title = cleanArticleMetadataText(input.title);
  const excerpt = cleanArticleMetadataText(input.excerpt);

  if (excerpt.length >= MIN_DESCRIPTION_LENGTH) {
    return truncateMetadataText(excerpt);
  }

  const candidates = [
    excerpt,
    cleanArticleMetadataText(input.conceptSummary),
    cleanArticleMetadataText(input.answerSummary),
    ...splitMetadataSentences(cleanArticleMetadataText(input.content)),
  ].filter(Boolean);
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeForDeduplication(candidate);
    if (!normalized || seen.has(normalized)) continue;
    if (selected.length > 0 && candidate.length < 12) continue;
    seen.add(normalized);
    selected.push(candidate);
    if (joinMetadataParts(selected).length >= MIN_DESCRIPTION_LENGTH) break;
  }

  let description = joinMetadataParts(selected);
  if (!description) description = title;
  if (description.length < MIN_DESCRIPTION_LENGTH && title) {
    const normalizedTitle = normalizeForDeduplication(title);
    const normalizedDescription = normalizeForDeduplication(description);
    if (normalizedTitle && !normalizedDescription.includes(normalizedTitle)) {
      description = joinMetadataParts([title, description]);
    }
  }

  return truncateMetadataText(description || `${title}，整木行业资讯解读`);
}

function resolveEnterpriseName(input: ArticleAttributionInput) {
  const ownedEnterpriseName = cleanArticleMetadataText(
    input.ownedEnterprise?.companyShortName || input.ownedEnterprise?.companyName,
  );
  if (ownedEnterpriseName) return ownedEnterpriseName;
  return cleanArticleMetadataText(
    input.authorMember?.enterprise?.companyShortName || input.authorMember?.enterprise?.companyName,
  );
}

export function resolveArticleAttribution(input: ArticleAttributionInput): ResolvedArticleAttribution {
  const displayAuthor = cleanArticleMetadataText(input.displayAuthor);
  const enterpriseName = resolveEnterpriseName(input);
  const memberName = cleanArticleMetadataText(input.authorMember?.name);
  const memberType = cleanArticleMetadataText(input.authorMember?.memberType);
  const isEnterpriseSubmission = Boolean(
    enterpriseName || input.ownedEnterprise || memberType.startsWith("enterprise_"),
  );

  if (displayAuthor) {
    return {
      name: displayAuthor,
      schemaType: ORGANIZATION_NAME_PATTERN.test(displayAuthor) ? "Organization" : "Person",
      visibleLabel: "作者",
      isEnterpriseSubmission,
      isEditorialFallback: false,
    };
  }

  if (enterpriseName) {
    return {
      name: enterpriseName,
      schemaType: "Organization",
      visibleLabel: "投稿方",
      isEnterpriseSubmission: true,
      isEditorialFallback: false,
    };
  }

  if (memberName) {
    return {
      name: memberName,
      schemaType: ORGANIZATION_NAME_PATTERN.test(memberName) ? "Organization" : "Person",
      visibleLabel: "作者",
      isEnterpriseSubmission,
      isEditorialFallback: false,
    };
  }

  return {
    name: EDITORIAL_AUTHOR_NAME,
    schemaType: "Organization",
    visibleLabel: "发布编辑",
    isEnterpriseSubmission: false,
    isEditorialFallback: true,
  };
}
