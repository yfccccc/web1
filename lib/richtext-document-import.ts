import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { decodeHtmlEntities, escapeHtml, sanitizeRichText } from "@/lib/brand-content";

function toUploadProxyUrl(src: string) {
  const value = String(src || "").trim();
  if (!value) return value;
  if (value.startsWith("/api/upload/image?")) return value;
  if (value.startsWith("/uploads/")) {
    return `/api/upload/image?src=${encodeURIComponent(value)}`;
  }
  return value;
}

export const MAX_DOCUMENT_IMPORT_BYTES = 10 * 1024 * 1024;

const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const TXT_MIME_TYPES = new Set(["text/plain"]);
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const IMPORT_IMAGE_OPTIMIZE_MIN_BYTES = 320 * 1024;
const IMPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMPORT_IMAGE_MAX_WIDTH = 1600;
const IMPORT_IMAGE_WEBP_QUALITY = 82;
const GENERIC_FILENAME_TITLES = new Set(["doc", "docx", "document", "txt", "untitled", "wen-dang"]);
const MAX_IMPORTED_TITLE_LENGTH = 120;

export type ImportedTitleSource = "heading" | "firstLine" | "filename" | "none";

export type ImportedDocumentPayload = {
  title: string;
  titleSource: ImportedTitleSource;
  summary: string;
  keywords: string;
  legacyKeywordMismatch: boolean;
  html: string;
  warnings: string[];
};

type BlockMatch = {
  full: string;
  text: string;
  start: number;
  end: number;
  tag: string;
};

type MetadataKind = "title" | "summary" | "keywords" | "frontKeywords" | "backKeywords" | "body";

type MetadataMarker = {
  kind: MetadataKind;
  value: string;
};

const BLOCK_TAG_PATTERN = /<(h[1-6]|p|div|section|article|figure)[^>]*>([\s\S]*?)<\/\1>/gi;
const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='\u6807\u9898'] => h1:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='\u6807\u9898 1'] => h1:fresh",
  "p[style-name='\u6807\u98981'] => h1:fresh",
];

function getLowerExt(fileName: string) {
  return path.extname(fileName || "").trim().toLowerCase();
}

function normalizeBaseName(fileName: string) {
  const raw = fileName.replace(/\.[^.]+$/, "").trim();
  const sanitized = raw
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "imported-document";
}

function buildStoredImageName(ext: string) {
  return `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
}

function hasExpectedImageSignature(imageBuffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff;
  if (mimeType === "image/png") return imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(imageBuffer.subarray(0, 6).toString("ascii"));
  if (mimeType === "image/webp") return imageBuffer.subarray(0, 4).toString("ascii") === "RIFF" && imageBuffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function validateImportedImage(imageBuffer: Buffer, mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();
  if (!IMAGE_EXTENSIONS[normalizedMimeType]) throw new Error(`暂不支持 ${mimeType} 图片格式`);
  if (imageBuffer.byteLength <= 0 || imageBuffer.byteLength > IMPORT_IMAGE_MAX_BYTES) {
    throw new Error("Word 内嵌图片大小必须小于 5MB");
  }
  if (!hasExpectedImageSignature(imageBuffer, normalizedMimeType)) {
    throw new Error("Word 内嵌图片内容与声明格式不一致");
  }
}

async function optimizeImportedImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  const normalizedMimeType = mimeType.toLowerCase();
  const originalExt = IMAGE_EXTENSIONS[normalizedMimeType];
  if (!originalExt) {
    throw new Error(`鏆備笉鏀寔 ${mimeType} 鍥剧墖鏍煎紡`);
  }

  if (
    imageBuffer.byteLength < IMPORT_IMAGE_OPTIMIZE_MIN_BYTES ||
    !["image/jpeg", "image/png", "image/webp"].includes(normalizedMimeType)
  ) {
    return { buffer: imageBuffer, mimeType: normalizedMimeType, ext: originalExt };
  }

  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(imageBuffer, { failOn: "none" }).metadata();
    const shouldResize = typeof metadata.width === "number" && metadata.width > IMPORT_IMAGE_MAX_WIDTH;
    const shouldReencode = normalizedMimeType === "image/png" || normalizedMimeType === "image/jpeg";

    if (!shouldResize && !shouldReencode) {
      return { buffer: imageBuffer, mimeType: normalizedMimeType, ext: originalExt };
    }

    let pipeline = sharp(imageBuffer, { failOn: "none" });
    if (shouldResize) {
      pipeline = pipeline.resize({
        width: IMPORT_IMAGE_MAX_WIDTH,
        withoutEnlargement: true,
      });
    }

    const optimizedBuffer = await pipeline
      .webp({
        quality: IMPORT_IMAGE_WEBP_QUALITY,
        effort: 4,
      })
      .toBuffer();

    if (optimizedBuffer.byteLength >= imageBuffer.byteLength * 0.95 && !shouldResize) {
      return { buffer: imageBuffer, mimeType: normalizedMimeType, ext: originalExt };
    }

    return {
      buffer: optimizedBuffer,
      mimeType: "image/webp",
      ext: ".webp",
    };
  } catch {
    return { buffer: imageBuffer, mimeType: normalizedMimeType, ext: originalExt };
  }
}

function isDocxFile(file: File) {
  const ext = getLowerExt(file.name);
  if (ext) return ext === ".docx";
  return DOCX_MIME_TYPES.has(file.type);
}

function isTxtFile(file: File) {
  const ext = getLowerExt(file.name);
  if (ext) return ext === ".txt";
  return TXT_MIME_TYPES.has(file.type);
}

function ensureSupportedFile(file: File) {
  if (file.size <= 0) {
    throw new Error("上传文件为空");
  }
  if (file.size >= MAX_DOCUMENT_IMPORT_BYTES) {
    throw new Error("文件大小必须小于 10MB");
  }
  if (isDocxFile(file) || isTxtFile(file)) return;
  throw new Error("仅支持导入 .docx 或 .txt 文件");
}

function stripHtmlTags(input: string) {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeImportedTitleText(input: string) {
  return stripHtmlTags(input)
    .replace(/[\u00a0\u2002-\u200b\u202f\u205f\u3000]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([:\uFF1A;\uFF1B,\uFF0C.\u3002!?\uFF01\uFF1F\u3001|\uFF5C\u300B\u3009\u3011\u3015\uFF09\]])/g, "$1")
    .replace(/([\u300A\u3008\u3010\u3014\uFF08\[])\s*/g, "$1")
    .replace(/([\u4e00-\u9fff])\s+(?=[0-9A-Za-z])/g, "$1")
    .replace(/([0-9A-Za-z])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .trim();
}

function isReasonableStructuredTitleCandidate(rawText: string) {
  const text = normalizeImportedTitleText(rawText);
  if (!text) return false;
  if (text.length < 4 || text.length > MAX_IMPORTED_TITLE_LENGTH) return false;
  return true;
}

function isReasonableFilenameTitle(text: string) {
  const normalized = normalizeImportedTitleText(text);
  if (!normalized || normalized.length > MAX_IMPORTED_TITLE_LENGTH) return false;
  if (GENERIC_FILENAME_TITLES.has(normalized.toLowerCase())) return false;
  if (/^\d+$/.test(normalized)) return false;
  return isReasonableStructuredTitleCandidate(normalized);
}

function extractBlockMatches(html: string) {
  const matches: BlockMatch[] = [];
  let match: RegExpExecArray | null;

  BLOCK_TAG_PATTERN.lastIndex = 0;
  while ((match = BLOCK_TAG_PATTERN.exec(html)) !== null) {
    matches.push({
      full: match[0],
      text: stripHtmlTags(match[2] ?? ""),
      start: match.index,
      end: match.index + match[0].length,
      tag: String(match[1] ?? "").toLowerCase(),
    });
  }

  return matches;
}

function parseMetadataMarker(input: string): MetadataMarker | null {
  const match = input.trim().match(/^(标题|摘要|关键词|前台关键词|后台关键词|正文)\s*[：:]\s*([\s\S]*)$/);
  if (!match) return null;
  const kindByLabel: Record<string, MetadataKind> = {
    标题: "title",
    摘要: "summary",
    关键词: "keywords",
    前台关键词: "frontKeywords",
    后台关键词: "backKeywords",
    正文: "body",
  };
  return { kind: kindByLabel[match[1]], value: match[2].trim() };
}

function normalizeKeywordCsv(input: string) {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of input.split(/[，,、;；]/)) {
    const keyword = raw.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }
  return keywords.join(",");
}

function removeBlockRanges(html: string, blocks: BlockMatch[], removedIndexes: Set<number>) {
  let cursor = 0;
  let output = "";
  blocks.forEach((block, index) => {
    if (!removedIndexes.has(index)) return;
    output += html.slice(cursor, block.start);
    cursor = block.end;
  });
  return `${output}${html.slice(cursor)}`;
}

function parseDocumentMetadata(rawHtml: string, fallbackTitle: string) {
  const blocks = extractBlockMatches(rawHtml);
  const markers = blocks.map((block) => parseMetadataMarker(block.text));
  const removedIndexes = new Set<number>();
  const warnings: string[] = [];
  let title = "";
  let titleSource: ImportedTitleSource = "none";
  let summary = "";
  let keywordValue = "";
  let frontKeywordValue = "";
  let backKeywordValue = "";
  let bodyMarkerIndex = -1;

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    if (!marker) continue;

    if (marker.kind === "title" && !title) {
      title = marker.value.trim();
      titleSource = "firstLine";
      removedIndexes.add(index);
      continue;
    }

    if (marker.kind === "summary" && !summary) {
      const summaryParts = marker.value ? [marker.value] : [];
      removedIndexes.add(index);
      if (!marker.value) {
        for (let next = index + 1; next < blocks.length && !markers[next]; next += 1) {
          const text = blocks[next].text.trim();
          if (text) summaryParts.push(text);
          removedIndexes.add(next);
        }
      }
      summary = summaryParts.join("\n").trim();
      continue;
    }

    if (["keywords", "frontKeywords", "backKeywords"].includes(marker.kind)) {
      let value = marker.value;
      removedIndexes.add(index);
      if (!value) {
        const next = index + 1;
        if (next < blocks.length && !markers[next]) {
          value = blocks[next].text.trim();
          removedIndexes.add(next);
        }
      }
      if (marker.kind === "keywords" && !keywordValue) keywordValue = value;
      if (marker.kind === "frontKeywords" && !frontKeywordValue) frontKeywordValue = value;
      if (marker.kind === "backKeywords" && !backKeywordValue) backKeywordValue = value;
      continue;
    }

    if (marker.kind === "body" && bodyMarkerIndex < 0) bodyMarkerIndex = index;
  }

  if (!title) {
    const titleIndex = blocks.findIndex((block, index) => {
      if (markers[index] || !block.text.trim()) return false;
      return isReasonableStructuredTitleCandidate(block.text);
    });
    if (titleIndex >= 0) {
      title = normalizeImportedTitleText(blocks[titleIndex].text);
      titleSource = "firstLine";
      removedIndexes.add(titleIndex);
    } else if (isReasonableFilenameTitle(fallbackTitle)) {
      title = normalizeImportedTitleText(fallbackTitle);
      titleSource = "filename";
    }
  }

  const normalizedFrontKeywords = normalizeKeywordCsv(frontKeywordValue);
  const normalizedBackKeywords = normalizeKeywordCsv(backKeywordValue);
  const legacyKeywordMismatch = Boolean(
    normalizedFrontKeywords && normalizedBackKeywords && normalizedFrontKeywords !== normalizedBackKeywords
  );
  if (legacyKeywordMismatch) warnings.push("LEGACY_KEYWORD_MISMATCH=YES");
  const keywords = normalizeKeywordCsv(keywordValue || normalizedFrontKeywords || normalizedBackKeywords);

  let bodyHtml: string;
  if (bodyMarkerIndex >= 0) {
    const marker = markers[bodyMarkerIndex];
    const inlineBody = marker?.value ? `<p>${escapeHtml(marker.value)}</p>` : "";
    bodyHtml = `${inlineBody}${rawHtml.slice(blocks[bodyMarkerIndex].end)}`;
  } else {
    bodyHtml = removeBlockRanges(rawHtml, blocks, removedIndexes);
  }

  return { title, titleSource, summary, keywords, legacyKeywordMismatch, bodyHtml, warnings };
}

async function saveImportedImage(imageBuffer: Buffer, mimeType: string) {
  validateImportedImage(imageBuffer, mimeType);
  const optimized = await optimizeImportedImage(imageBuffer, mimeType);
  const ext = optimized.ext;
  if (!ext) {
    throw new Error(`暂不支持 ${mimeType} 图片格式`);
  }

  const relativeDir = path.join("uploads", "content", "doc-import");
  const outputDir = path.join(process.cwd(), "public", relativeDir);
  const fileName = buildStoredImageName(ext);
  const outputPath = path.join(outputDir, fileName);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, optimized.buffer);

  return `/${relativeDir.replace(/\\/g, "/")}/${fileName}`;
}

async function importDocx(file: File): Promise<ImportedDocumentPayload> {
  const warnings: string[] = [];
  const fallbackTitle = normalizeBaseName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: DOCX_STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        const mimeType = String(image.contentType ?? "").toLowerCase();
        try {
          const base64 = await image.read("base64");
          const imageBuffer = Buffer.from(base64, "base64");
          const src = toUploadProxyUrl(await saveImportedImage(imageBuffer, mimeType));
          return { src, style: "display:block;max-width:100%;height:auto;margin:8px auto" };
        } catch (error) {
          const message = error instanceof Error ? error.message : "图片转存失败";
          warnings.push(message);
          return { src: "" };
        }
      }),
    }
  );

  warnings.push(...result.messages.map((item) => item.message.trim()).filter(Boolean));

  const parsed = parseDocumentMetadata(result.value, fallbackTitle);
  warnings.push(...parsed.warnings);
  const sanitizedHtml = sanitizeRichText(parsed.bodyHtml);
  if (!sanitizedHtml) {
    throw new Error("文档中没有可导入的正文内容");
  }

  return {
    title: parsed.title,
    titleSource: parsed.titleSource,
    summary: parsed.summary,
    keywords: parsed.keywords,
    legacyKeywordMismatch: parsed.legacyKeywordMismatch,
    html: sanitizedHtml,
    warnings,
  };
}

async function importTxt(file: File): Promise<ImportedDocumentPayload> {
  const fallbackTitle = normalizeBaseName(file.name);
  const text = Buffer.from(await file.arrayBuffer()).toString("utf8").replace(/^\uFEFF/, "");
  const normalized = text.replace(/\r\n?/g, "\n").trim();

  if (!normalized) {
    throw new Error("文档中没有可导入的正文内容");
  }

  const blocks = normalized
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sourceHtml = blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const parsed = parseDocumentMetadata(sourceHtml, fallbackTitle);
  const html = sanitizeRichText(parsed.bodyHtml);

  if (!html) {
    throw new Error("文档中没有可导入的正文内容");
  }

  return {
    title: parsed.title,
    titleSource: parsed.titleSource,
    summary: parsed.summary,
    keywords: parsed.keywords,
    legacyKeywordMismatch: parsed.legacyKeywordMismatch,
    html,
    warnings: parsed.warnings,
  };
}

export async function importRichTextDocument(file: File) {
  ensureSupportedFile(file);
  if (isTxtFile(file)) return importTxt(file);
  if (isDocxFile(file)) return importDocx(file);
  throw new Error("仅支持导入 .docx 或 .txt 文件");
}
