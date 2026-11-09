import { File } from "node:buffer";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { importRichTextDocument } from "../lib/richtext-document-import";
import { readImportedDocumentMetadata } from "../lib/richtext-import-contract";
import { normalizeRichTextField } from "../lib/brand-content";

const SHOP_URL = "https://csj.cnzhengmu.com/wx/scheme/tLuTuTWBVLFY";
const PNG_BYTES = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const JPEG_BYTES = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "base64");

async function testTxtImport() {
  const file = new File(
    ["整木词库 TXT 导入测试\n\n第一段正文\n第二行\n\n第二段正文"],
    "dictionary-import.txt",
    { type: "text/plain" },
  );
  const result = await importRichTextDocument(file);
  if (result.title !== "整木词库TXT导入测试") throw new Error(`TXT 标题识别失败：${result.title}`);
  if (!result.html.includes("<p>第一段正文<br>第二行</p>") || !result.html.includes("<p>第二段正文</p>")) {
    throw new Error(`TXT 正文转换失败：${result.html}`);
  }
}

async function buildDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="jpg" ContentType="image/jpeg"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
      </Types>`,
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
  );
  zip.folder("word")?.file(
    "styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
        <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
      </w:styles>`,
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <w:body>
          <w:p><w:r><w:t>标题：测试 Word 导入增强</w:t></w:r></w:p>
          <w:p><w:r><w:t>摘要：这是用于测试中华整木网 Word 摘要自动导入的内容。</w:t></w:r></w:p>
          <w:p><w:r><w:t>关键词：</w:t></w:r></w:p>
          <w:p><w:r><w:t>木地板清洁，装修开荒；深度清洁、WOCA强力木制品清洁剂，木地板清洁</w:t></w:r></w:p>
          <w:p><w:r><w:t>正文：</w:t></w:r></w:p>
          <w:p><w:r><w:t>第一段普通正文。</w:t></w:r></w:p>
          <w:p><w:hyperlink r:id="rIdShop"><w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="Poster" descr="商品海报"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rIdJpeg"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:hyperlink></w:p>
          <w:p><w:hyperlink r:id="rIdShop"><w:r><w:t>进入整木商城查看 WOCA 强力木制品清洁剂</w:t></w:r></w:hyperlink></w:p>
          <w:p><w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><wp:docPr id="2" name="Second image"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rIdPng"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
          <w:p><w:hyperlink r:id="rIdDanger"><w:r><w:t>危险链接可见文本</w:t></w:r></w:hyperlink></w:p>
          <w:p><w:r><w:t>第二段普通正文。</w:t></w:r></w:p>
          <w:sectPr/>
        </w:body>
      </w:document>`,
  );
  zip.folder("word")?.folder("_rels")?.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
        <Relationship Id="rIdJpeg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/poster.jpg"/>
        <Relationship Id="rIdPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/second.png"/>
        <Relationship Id="rIdShop" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${SHOP_URL}" TargetMode="External"/>
        <Relationship Id="rIdDanger" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
      </Relationships>`,
  );
  zip.folder("word")?.folder("media")?.file("poster.jpg", JPEG_BYTES);
  zip.folder("word")?.folder("media")?.file("second.png", PNG_BYTES);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildSimpleDocx(paragraphs: string[]) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
  );
  const paragraphXml = paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("");
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphXml}<w:sectPr/></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function importSimpleDocx(paragraphs: string[], name: string) {
  return importRichTextDocument(new File([await buildSimpleDocx(paragraphs)], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));
}

async function testLegacyDocxCompatibility() {
  const titleOnly = await importSimpleDocx(["旧版文章标题", "旧版第一段正文"], "legacy-title-only.docx");
  if (titleOnly.title !== "旧版文章标题" || !titleOnly.html.includes("旧版第一段正文")) {
    throw new Error(`LEGACY_DOCX_TITLE_ONLY 失败：${JSON.stringify(titleOnly)}`);
  }

  const titleSummary = await importSimpleDocx(
    ["旧版标题摘要文档", "摘要：旧版摘要", "旧版正文第一段", "旧版正文第二段"],
    "legacy-title-summary.docx",
  );
  if (titleSummary.summary !== "旧版摘要" || !titleSummary.html.includes("旧版正文第一段") || titleSummary.html.includes("旧版摘要")) {
    throw new Error(`LEGACY_DOCX_TITLE_SUMMARY 失败：${JSON.stringify(titleSummary)}`);
  }

  const dualKeywords = await importSimpleDocx(
    ["标题：旧版双关键词", "前台关键词：木地板清洁，装修开荒", "后台关键词：其他关键词", "正文：", "双关键词正文"],
    "legacy-dual-keywords.docx",
  );
  if (dualKeywords.keywords !== "木地板清洁,装修开荒" || !dualKeywords.legacyKeywordMismatch || !dualKeywords.warnings.includes("LEGACY_KEYWORD_MISMATCH=YES")) {
    throw new Error(`LEGACY_DUAL_KEYWORDS 失败：${JSON.stringify(dualKeywords)}`);
  }

  const multilineSummary = await importSimpleDocx(
    ["标题：多段摘要文档", "摘要：", "摘要第一段", "摘要第二段", "关键词：木门；整木", "正文：", "多段摘要后的正文"],
    "multiline-summary.docx",
  );
  if (multilineSummary.summary !== "摘要第一段\n摘要第二段" || multilineSummary.keywords !== "木门,整木" || !multilineSummary.html.includes("多段摘要后的正文")) {
    throw new Error(`MULTILINE_SUMMARY 失败：${JSON.stringify(multilineSummary)}`);
  }
}

async function testDocxImport() {
  const fixture = await buildDocx();
  const fixtureDir = path.join(process.cwd(), "tests", "fixtures");
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(path.join(fixtureDir, "word-import-full-feature.docx"), fixture);
  const file = new File([fixture], "word-import-full-feature.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const result = await importRichTextDocument(file);
  console.log(`PARSED_TITLE=${result.title}`);
  console.log(`PARSED_SUMMARY=${result.summary}`);
  console.log(`PARSED_KEYWORDS=${result.keywords}`);
  console.log(`PARSED_HTML_HAS_IMAGE=${/<img\b/.test(result.html)}`);
  console.log(`PARSED_HTML_HAS_TEXT_LINK=${new RegExp(`<a href="${SHOP_URL}"[^>]*>进入整木商城`).test(result.html)}`);
  console.log(`PARSED_HTML_HAS_IMAGE_LINK=${new RegExp(`<a href="${SHOP_URL}"[^>]*><img\\b`).test(result.html)}`);
  const savedHtml = normalizeRichTextField(result.html) ?? "";
  console.log(`SAVED_HTML_HAS_IMAGE_LINK=${new RegExp(`<a href="${SHOP_URL}"[^>]*><img\\b`).test(savedHtml)}`);
  if (!new RegExp(`<a href="${SHOP_URL}"[^>]*><img\\b`).test(savedHtml)) {
    throw new Error(`保存阶段图片链接丢失：${savedHtml}`);
  }
  const callbackMetadata = readImportedDocumentMetadata(result);
  if (callbackMetadata.summary !== result.summary || callbackMetadata.keywords !== result.keywords) {
    throw new Error(`Word metadata callback contract 失败：${JSON.stringify(callbackMetadata)}`);
  }
  const cappedMetadata = readImportedDocumentMetadata({ keywords: "一，二，三，四，五，六" });
  if (cappedMetadata.keywords !== "一,二,三,四,五") {
    throw new Error(`Word 关键词最多 5 个规则失败：${cappedMetadata.keywords}`);
  }
  if (result.title !== "测试 Word 导入增强") throw new Error(`DOCX 标题识别失败：${result.title}`);
  if (result.summary !== "这是用于测试中华整木网 Word 摘要自动导入的内容。") throw new Error(`DOCX 摘要识别失败：${result.summary}`);
  if (result.keywords !== "木地板清洁,装修开荒,深度清洁,WOCA强力木制品清洁剂") throw new Error(`DOCX 关键词识别失败：${result.keywords}`);
  for (const token of ["第一段普通正文。", "第二段普通正文。", "商品海报", SHOP_URL, "进入整木商城查看 WOCA 强力木制品清洁剂", "危险链接可见文本"]) {
    if (!result.html.includes(token)) throw new Error(`DOCX 内容转换失败，缺少 ${token}：${result.html}`);
  }
  if (result.html.includes("标题：") || result.html.includes("摘要：") || result.html.includes("关键词：") || result.html.includes("正文：")) {
    throw new Error(`DOCX 元数据未从正文移除：${result.html}`);
  }
  if ((result.html.match(/<img\b/g) ?? []).length !== 2) throw new Error(`DOCX 图片导入失败：${result.html}`);
  if (!new RegExp(`<a href="${SHOP_URL}"[^>]*><img[^>]+alt="商品海报"`).test(result.html)) throw new Error(`DOCX 图片链接导入失败：${result.html}`);
  if (!new RegExp(`<a href="${SHOP_URL}"[^>]*>进入整木商城`).test(result.html)) throw new Error(`DOCX 文字链接导入失败：${result.html}`);
  if (/href="javascript:/i.test(result.html)) throw new Error(`危险 URL 未移除：${result.html}`);
  const order = ["第一段普通正文。", "alt=\"商品海报\"", "进入整木商城", "alt=\"\"", "危险链接可见文本", "第二段普通正文。"].map((token) => result.html.indexOf(token));
  if (order.some((index) => index < 0) || order.some((index, position) => position > 0 && index <= order[position - 1])) {
    throw new Error(`DOCX 内容顺序错误：${result.html}`);
  }

  const importedImagePaths = Array.from(result.html.matchAll(/src="(\/uploads\/content\/doc-import\/[^\"]+)"/g))
    .map((match) => path.join(process.cwd(), "public", match[1].replace(/^\//, "")));
  await Promise.all(importedImagePaths.map((filePath) => unlink(filePath).catch(() => undefined)));
}

async function main() {
  await testTxtImport();
  await testDocxImport();
  await testLegacyDocxCompatibility();
  console.log("rich-text DOCX/TXT import test: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
