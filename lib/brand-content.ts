const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "aside",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "pre",
  "code",
  "video",
]);

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "span",
  "strong",
  "em",
  "u",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "img",
  "div",
  "section",
  "article",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "pre",
  "code",
  "video",
  "source",
]);
const DROP_WITH_CONTENT_TAGS = ["script", "style", "object", "embed", "svg", "math", "form", "noscript"];
const SUSPICIOUS_TEXT_PATTERN = /[�]{2,}|(?:Ã|Â|â|ð|æ|å|ç){2,}|(?:\?{2,})/;
const SAFE_FONT_SIZE_VALUES = new Set(["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"]);

function decodeNamedEntity(entity: string) {
  switch (entity) {
    case "nbsp":
    case "ensp":
    case "emsp":
      return " ";
    case "amp":
      return "&";
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "quot":
      return '"';
    case "apos":
      return "'";
    case "middot":
      return "·";
    default:
      return `&${entity};`;
  }
}

function attemptLatin1Repair(input: string) {
  try {
    const bytes = Uint8Array.from(Array.from(input), (char) => char.charCodeAt(0) & 0xff);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return input;
  }
}

function suspiciousScore(value: string) {
  const suspicious = value.match(/[�ÃÂâðæåç]/g)?.length ?? 0;
  return suspicious / Math.max(1, value.length);
}

export function repairMojibake(input: string) {
  const raw = String(input ?? "");
  if (!raw) return "";
  if (!SUSPICIOUS_TEXT_PATTERN.test(raw) && suspiciousScore(raw) < 0.08) return raw;

  const repaired = attemptLatin1Repair(raw);
  if (suspiciousScore(repaired) < suspiciousScore(raw)) {
    return repaired;
  }
  return raw;
}

export function containsSuspiciousText(input: string | null | undefined) {
  const value = String(input ?? "");
  return Boolean(value) && (SUSPICIOUS_TEXT_PATTERN.test(value) || suspiciousScore(value) >= 0.08);
}

export function decodeHtmlEntities(input: string) {
  return repairMojibake(input).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return decodeNamedEntity(normalized);
  });
}

export function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripUnsafeContainers(input: string) {
  let output = input;
  for (const tag of DROP_WITH_CONTENT_TAGS) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    const single = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    output = output.replace(paired, "").replace(single, "");
  }
  return output;
}

function normalizeUnsafeWrappers(input: string) {
  return input
    .replace(/<\/?font\b[^>]*>/gi, "")
    .replace(/<(?:header|footer|aside)\b[^>]*>/gi, "<section>")
    .replace(/<\/(?:header|footer|aside)>/gi, "</section>")
    .replace(/<b\b[^>]*>/gi, "<strong>")
    .replace(/<\/b>/gi, "</strong>")
    .replace(/<i\b[^>]*>/gi, "<em>")
    .replace(/<\/i>/gi, "</em>");
}

function isSafeHref(value: string) {
  return /^(https?:|mailto:|tel:|\/)/i.test(value);
}

function isInternalHref(value: string) {
  const href = String(value ?? "").trim();
  if (/^\/(?!\/)/.test(href)) return true;
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const hostname = new URL(href).hostname.toLowerCase();
    return hostname === "cnzhengmu.com" || hostname === "www.cnzhengmu.com";
  } catch {
    return false;
  }
}

function normalizeManagedImageSrc(value: string) {
  const input = String(value ?? "").trim();
  if (!input) return "";

  if (input.startsWith("/api/upload/image?src=")) {
    const encoded = input.slice("/api/upload/image?src=".length).trim();
    let decoded = encoded;
    if (encoded) {
      try {
        decoded = decodeURIComponent(encoded);
      } catch {
        decoded = encoded;
      }
    }
    return normalizeManagedImageSrc(decoded);
  }

  if (input.startsWith("/uploads/")) {
    if (input.includes("\\") || input.includes("\0")) return "";
    const normalized = input.replace(/\/{2,}/g, "/");
    const segments = normalized.slice("/uploads/".length).split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) return "";
    return normalized;
  }

  if (/^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      const host = parsed.hostname.toLowerCase();
      if (!["cnzhengmu.com", "www.cnzhengmu.com", "jiu.cnzhengmu.com"].includes(host)) return "";
      return normalizeManagedImageSrc(parsed.pathname);
    } catch {
      return "";
    }
  }

  return "";
}

function isSafeSrc(value: string) {
  return Boolean(normalizeManagedImageSrc(value));
}

function parseAttributes(input: string) {
  const attributes = new Map<string, string>();
  const regex = /([:@\w-]+)(?:\s*=\s*(\"([^\"]*)\"|'([^']*)'|([^\s\"'=<>`]+)))?/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    const name = match[1]?.toLowerCase();
    if (!name || name.startsWith("on")) continue;
    const rawValue = match[3] ?? match[4] ?? match[5] ?? "";
    attributes.set(name, decodeHtmlEntities(rawValue).trim());
  }

  return attributes;
}

function clampImageDimension(value: string | null | undefined) {
  if (!value) return "";
  const matched = value.trim().match(/^(\d{1,4})(?:px)?$/i);
  if (!matched) return "";
  const dimension = Number.parseInt(matched[1], 10);
  if (!Number.isFinite(dimension) || dimension < 1 || dimension > 2400) return "";
  return `${dimension}px`;
}

function clampLength(value: string | null | undefined, max = 2400) {
  if (!value) return "";
  const matched = value.trim().match(/^(\d{1,4})(?:px)?$/i);
  if (!matched) return "";
  const dimension = Number.parseInt(matched[1], 10);
  if (!Number.isFinite(dimension) || dimension < 1 || dimension > max) return "";
  return `${dimension}px`;
}

function pickCssValue(source: string, prop: string) {
  return source.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)\\s*(?:;|$)`, "i"))?.[1]?.trim() ?? "";
}

function extractSafeTextAlign(styleText: string | null | undefined) {
  const raw = pickCssValue(String(styleText ?? ""), "text-align").toLowerCase();
  return ["left", "center", "right", "justify"].includes(raw) ? raw : "";
}

function extractSafeImageStyle(styleText: string | null | undefined) {
  const source = String(styleText ?? "");
  if (!source) return "";

  const safeRules: string[] = [];
  const display = source.match(/(?:^|;)\s*display\s*:\s*(block)\s*(?:;|$)/i)?.[1];
  if (display) safeRules.push(`display:${display.toLowerCase()}`);

  const width = clampImageDimension(source.match(/(?:^|;)\s*width\s*:\s*([^;]+)\s*(?:;|$)/i)?.[1]);
  if (width) safeRules.push(`width:${width}`);

  const maxWidth = source.match(/(?:^|;)\s*max-width\s*:\s*(100%)\s*(?:;|$)/i)?.[1];
  if (maxWidth) safeRules.push(`max-width:${maxWidth}`);

  const heightRaw = source.match(/(?:^|;)\s*height\s*:\s*([^;]+)\s*(?:;|$)/i)?.[1]?.trim().toLowerCase() ?? "";
  if (heightRaw === "auto") {
    safeRules.push("height:auto");
  } else {
    const height = clampImageDimension(heightRaw);
    if (height) safeRules.push(`height:${height}`);
  }

  const margin = source.match(/(?:^|;)\s*margin\s*:\s*([^;]+)\s*(?:;|$)/i)?.[1]?.trim() ?? "";
  if (margin && /^((auto|\d+(?:\.\d+)?px)\s+){0,3}(auto|\d+(?:\.\d+)?px)$/.test(margin)) {
    safeRules.push(`margin:${margin.replace(/\s+/g, " ")}`);
  }

  const objectFit = source.match(/(?:^|;)\s*object-fit\s*:\s*(contain|cover)\s*(?:;|$)/i)?.[1];
  if (objectFit) safeRules.push(`object-fit:${objectFit.toLowerCase()}`);

  const borderRadius = clampImageDimension(
    source.match(/(?:^|;)\s*border-radius\s*:\s*([^;]+)\s*(?:;|$)/i)?.[1]
  );
  if (borderRadius) safeRules.push(`border-radius:${borderRadius}`);

  return safeRules.join(";");
}

function extractSafeBlockStyle(styleText: string | null | undefined) {
  const align = extractSafeTextAlign(styleText);
  return align ? `text-align:${align}` : "";
}

function extractSafeInlineStyle(styleText: string | null | undefined) {
  const size = pickCssValue(String(styleText ?? ""), "font-size").toLowerCase();
  return SAFE_FONT_SIZE_VALUES.has(size) ? `font-size:${size}` : "";
}

function extractSafeElementId(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return /^[a-z][a-z0-9_-]*$/i.test(normalized) ? normalized : "";
}

function extractSafeTableStyle(styleText: string | null | undefined) {
  const source = String(styleText ?? "");
  const safeRules = ["width:100%", "max-width:100%"];
  const borderCollapse = pickCssValue(source, "border-collapse").toLowerCase();
  if (["collapse", "separate"].includes(borderCollapse)) {
    safeRules.push(`border-collapse:${borderCollapse}`);
  }
  return safeRules.join(";");
}

function extractSafeCellStyle(styleText: string | null | undefined) {
  const source = String(styleText ?? "");
  const safeRules: string[] = [];
  const align = extractSafeTextAlign(source);
  if (align) safeRules.push(`text-align:${align}`);
  const width = clampLength(pickCssValue(source, "width"), 1200);
  if (width) safeRules.push(`width:${width}`);
  return safeRules.join(";");
}

function extractSafePreStyle(styleText: string | null | undefined) {
  const align = extractSafeTextAlign(styleText);
  return align ? `max-width:100%;text-align:${align}` : "max-width:100%";
}

function extractSafeMediaStyle(styleText: string | null | undefined) {
  const source = String(styleText ?? "");
  const safeRules = ["width:100%", "max-width:100%"];
  const width = clampLength(pickCssValue(source, "width"), 1600);
  const height = clampLength(pickCssValue(source, "height"), 1200);
  if (width) safeRules.push(`width:${width}`);
  if (height) safeRules.push(`height:${height}`);
  return safeRules.join(";");
}

function sanitizeTag(tagName: string, attrText: string) {
  const tag = tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return "";

  if (tag === "a") {
    const attrs = parseAttributes(attrText);
    const href = attrs.get("href") ?? "";
    if (!isSafeHref(href)) return "";
    const title = attrs.get("title");
    const externalAttributes = isInternalHref(href) ? "" : ' target="_blank" rel="noopener noreferrer nofollow"';
    return `<a href="${escapeHtml(href)}"${externalAttributes}${title ? ` title="${escapeHtml(title)}"` : ""}>`;
  }

  if (tag === "img") {
    const attrs = parseAttributes(attrText);
    const src = normalizeManagedImageSrc(attrs.get("src") ?? "");
    if (!isSafeSrc(src)) return "";
    const alt = attrs.get("alt") ?? "";
    const title = attrs.get("title");
    const width = clampImageDimension(attrs.get("width"));
    const height = clampImageDimension(attrs.get("height"));
    const style = extractSafeImageStyle(attrs.get("style"));
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${
      title ? ` title="${escapeHtml(title)}"` : ""
    }${width ? ` width="${width.replace(/px$/i, "")}"` : ""}${height ? ` height="${height.replace(/px$/i, "")}"` : ""}${
      style ? ` style="${escapeHtml(style)}"` : ""
    }>`;
  }

  if (tag === "video") {
    const attrs = parseAttributes(attrText);
    const src = attrs.get("src") ?? "";
    const poster = attrs.get("poster") ?? "";
    const style = extractSafeMediaStyle(attrs.get("style"));
    return `<video${isSafeSrc(src) ? ` src="${escapeHtml(src)}"` : ""}${isSafeSrc(poster) ? ` poster="${escapeHtml(poster)}"` : ""} preload="metadata" controls${style ? ` style="${escapeHtml(style)}"` : ""}></video>`;
  }

  if (tag === "source") {
    const attrs = parseAttributes(attrText);
    const src = attrs.get("src") ?? "";
    if (!isSafeSrc(src)) return "";
    const type = attrs.get("type");
    return `<source src="${escapeHtml(src)}"${type ? ` type="${escapeHtml(type)}"` : ""}>`;
  }

  if (tag === "span") {
    const attrs = parseAttributes(attrText);
    const style = extractSafeInlineStyle(attrs.get("style"));
    return style ? `<span style="${escapeHtml(style)}">` : "";
  }

  if (["p", "blockquote", "div", "section", "article", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
    const attrs = parseAttributes(attrText);
    const style = extractSafeBlockStyle(attrs.get("style"));
    const id = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ? extractSafeElementId(attrs.get("id")) : "";
    return `<${tag}${id ? ` id="${escapeHtml(id)}"` : ""}${style ? ` style="${escapeHtml(style)}"` : ""}>`;
  }

  if (tag === "table") {
    const attrs = parseAttributes(attrText);
    const style = extractSafeTableStyle(attrs.get("style"));
    return `<table${style ? ` style="${escapeHtml(style)}"` : ""}>`;
  }

  if (["td", "th"].includes(tag)) {
    const attrs = parseAttributes(attrText);
    const colspan = attrs.get("colspan")?.match(/^\d{1,2}$/)?.[0];
    const rowspan = attrs.get("rowspan")?.match(/^\d{1,2}$/)?.[0];
    const style = extractSafeCellStyle(attrs.get("style"));
    return `<${tag}${colspan ? ` colspan="${colspan}"` : ""}${rowspan ? ` rowspan="${rowspan}"` : ""}${style ? ` style="${escapeHtml(style)}"` : ""}>`;
  }

  if (tag === "pre") {
    const attrs = parseAttributes(attrText);
    const style = extractSafePreStyle(attrs.get("style"));
    return `<pre${style ? ` style="${escapeHtml(style)}"` : ""}>`;
  }

  return `<${tag}>`;
}

function normalizeWhitespace(input: string) {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeHtml(input: string) {
  return /<[^>]+>/.test(input) || /&(nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i.test(input);
}

function textToParagraphs(input: string) {
  const text = normalizeWhitespace(decodeHtmlEntities(input));
  if (!text) return "";

  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function removeEmptyBlocks(input: string) {
  let output = input;
  const emptyPatterns = [
    /<p>(?:\s|&nbsp;|<br>)*<\/p>/gi,
    /<blockquote>(?:\s|&nbsp;|<br>)*<\/blockquote>/gi,
    /<h[23]>(?:\s|&nbsp;|<br>)*<\/h[23]>/gi,
    /<li>(?:\s|&nbsp;|<br>)*<\/li>/gi,
    /<strong>(?:\s|&nbsp;|<br>)*<\/strong>/gi,
    /<em>(?:\s|&nbsp;|<br>)*<\/em>/gi,
    /<u>(?:\s|&nbsp;|<br>)*<\/u>/gi,
  ];
  for (const pattern of emptyPatterns) {
    output = output.replace(pattern, "");
  }
  return output;
}

function repairNestedParagraphs(input: string) {
  return input
    .replace(/<p>\s*(<(?:p|h[1-6]|blockquote|ul|ol|table|pre|div|section|article|figure)[^>]*>)/gi, "$1")
    .replace(/(<\/(?:p|h[1-6]|blockquote|ul|ol|table|pre|div|section|article|figure)>)\s*<\/p>/gi, "$1");
}

function normalizeSpanClosures(input: string) {
  let openSpans = 0;
  return input.replace(/<\/?span\b[^>]*>/gi, (tag) => {
    if (/^<span\b/i.test(tag)) {
      openSpans += 1;
      return tag;
    }
    if (openSpans > 0) {
      openSpans -= 1;
      return tag;
    }
    return "";
  });
}

export function sanitizeRichText(input: string | null | undefined) {
  const raw = repairMojibake(String(input ?? "").trim());
  if (!raw) return "";
  if (!looksLikeHtml(raw)) return textToParagraphs(raw);

  const containsActualTags = /<[^>]+>/.test(raw);
  let html = normalizeWhitespace(containsActualTags ? raw : decodeHtmlEntities(raw));
  html = stripUnsafeContainers(html);
  html = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:meta|link|base|input|button|textarea|select)\b[^>]*>/gi, "")
    .replace(/<\/(?:meta|link|base|input|button|textarea|select)>/gi, "");
  html = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match, attrs, inner) => {
    const href = parseAttributes(attrs).get("href") ?? "";
    return isSafeHref(href) ? match : inner;
  });
  html = normalizeUnsafeWrappers(html);
  html = html.replace(/<h1\b/gi, "<h2").replace(/<\/h1>/gi, "</h2>");
  html = html.replace(/<br\s*\/?>/gi, "<br>");
  html = html.replace(/<([a-z0-9-]+)\b([^>]*)>/gi, (_match, tagName, attrs) => sanitizeTag(tagName, attrs));
  html = html.replace(/<\/([a-z0-9-]+)>/gi, (_match, tagName) => {
    const tag = tagName.toLowerCase();
    return ALLOWED_TAGS.has(tag) && tag !== "img" && tag !== "source" ? `</${tag}>` : "";
  });
  html = html
    .replace(/<p>\s*(<img\b[^>]*>)\s*<\/p>/gi, "$1")
    .replace(/<p>\s*(<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>)\s*<\/p>/gi, "$1")
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .replace(/\s+(<\/(?:p|li|blockquote|h[1-6]|ul|ol|pre|code|table|thead|tbody|tr|td|th|figure|figcaption|section|article|div)>)/gi, "$1")
    .replace(/(<(?:p|li|blockquote|h[1-6]|figcaption)>)[\s\n]+/gi, "$1");
  html = normalizeSpanClosures(repairNestedParagraphs(removeEmptyBlocks(html))).trim();
  return html || textToParagraphs(raw);
}

export function htmlToPlainText(input: string | null | undefined) {
  const safeHtml = sanitizeRichText(input);
  if (!safeHtml) return "";

  return normalizeWhitespace(
    decodeHtmlEntities(
      safeHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|li|blockquote|h[1-6]|ul|ol|pre|code|table|thead|tbody|tr|td|th|figure|figcaption|section|article|div)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
  ).replace(/\s*\n\s*/g, "\n");
}

export function toSummaryText(input: string | null | undefined, maxLength = 120) {
  const text = htmlToPlainText(input);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function normalizePlainTextField(input: unknown) {
  if (typeof input !== "string") return null;
  const text = htmlToPlainText(input).replace(/\n+/g, " ").trim();
  return text || null;
}

export function normalizeRichTextField(input: unknown) {
  if (typeof input !== "string") return null;
  const html = sanitizeRichText(input);
  return html || null;
}

export function hasRenderableContent(input: string | null | undefined) {
  return htmlToPlainText(input).length > 0;
}

export function isLikelyRichText(input: string | null | undefined) {
  const value = String(input ?? "");
  return BLOCK_TAGS.size > 0 && /<(p|div|span|br|strong|b|em|i|ul|ol|li|h[1-6]|blockquote)\b/i.test(value);
}
