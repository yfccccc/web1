import fs from "node:fs";
import path from "node:path";
import {
  LINK_PLANS,
  TARGET_TERMS,
  createPrismaClient,
  normalizeTermTitle,
  parseCliArgs,
  writeJson,
} from "./dictionary-link-config.mjs";

const args = parseCliArgs();
const applyMode = Boolean(args.apply);
const dryRunMode = Boolean(args["dry-run"]) || !applyMode;
const reportPath = String(args.report || `scripts/output/dictionary-link-backfill-${applyMode ? "apply" : "dry-run"}.json`);
const urlMapPath = path.resolve(String(args["url-map"] || "scripts/output/dictionary-url-map.json"));
const anomalyPath = path.resolve(String(args.anomalies || "scripts/output/dictionary-url-anomalies.json"));
const prisma = createPrismaClient();

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const EXCLUDED_LINK_ANCESTORS = new Set(["a", "h1", "h2", "h3", "h4", "h5", "h6", "script", "style"]);
const PLACEHOLDER_RE = /〔[^〕]*上线后回填[^〕]*〕|【[^】]*上线后回填[^】]*】|上线后回填|URL占位符|\{\{URL:[^}]+\}\}/g;

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseAttributes(rawOpen) {
  const body = rawOpen.replace(/^<\/?\s*[A-Za-z0-9:-]+/, "").replace(/\/?\s*>$/, "");
  const attributes = [];
  const regex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = regex.exec(body))) {
    attributes.push({ name: match[1], value: match[2] ?? match[3] ?? match[4] ?? null });
  }
  return attributes;
}

function parseHtmlFragment(html) {
  const root = { type: "root", children: [], parent: null };
  const stack = [root];
  const tokens = String(html).match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+|</g) ?? [];
  for (const raw of tokens) {
    const parent = stack[stack.length - 1];
    if (raw.startsWith("<!--") || raw.startsWith("<!")) {
      parent.children.push({ type: "raw", raw, parent });
      continue;
    }
    const close = raw.match(/^<\/\s*([A-Za-z0-9:-]+)/);
    if (close) {
      const tag = close[1].toLowerCase();
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack[index].rawClose = raw;
          stack.length = index;
          break;
        }
      }
      continue;
    }
    const open = raw.match(/^<\s*([A-Za-z0-9:-]+)/);
    if (open) {
      const tag = open[1].toLowerCase();
      const node = { type: "element", tag, rawOpen: raw, rawClose: "", attributes: parseAttributes(raw), children: [], parent, modifiedOpen: false };
      parent.children.push(node);
      if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(raw)) stack.push(node);
      continue;
    }
    parent.children.push({ type: "text", value: raw, parent });
  }
  return root;
}

function serialize(node) {
  if (node.type === "text") return node.value;
  if (node.type === "raw") return node.raw;
  if (node.type === "root") return node.children.map(serialize).join("");
  const open = node.modifiedOpen
    ? `<${node.tag}${node.attributes.map((attribute) => attribute.value === null ? ` ${attribute.name}` : ` ${attribute.name}="${escapeAttribute(attribute.value)}"`).join("")}>`
    : node.rawOpen;
  return `${open}${node.children.map(serialize).join("")}${node.rawClose || (VOID_TAGS.has(node.tag) ? "" : `</${node.tag}>`)}`;
}

function nodeText(node) {
  if (node.type === "text") return node.value;
  if (!node.children) return "";
  return node.children.map(nodeText).join("");
}

function descendants(root, predicate, output = []) {
  for (const child of root.children ?? []) {
    if (predicate(child)) output.push(child);
    if (child.children) descendants(child, predicate, output);
  }
  return output;
}

function hasExcludedAncestor(node) {
  let cursor = node.parent;
  while (cursor && cursor.type !== "root") {
    if (EXCLUDED_LINK_ANCESTORS.has(cursor.tag)) return true;
    cursor = cursor.parent;
  }
  return false;
}

function getAttribute(node, name) {
  return node.attributes.find((attribute) => attribute.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function setAnchorHref(node, href) {
  const kept = node.attributes.filter((attribute) => !["href", "target", "rel"].includes(attribute.name.toLowerCase()));
  node.attributes = [{ name: "href", value: href }, ...kept];
  node.modifiedOpen = true;
}

function siblingMarkerScore(node) {
  const siblings = node.parent?.children ?? [];
  const index = siblings.indexOf(node);
  const following = siblings.slice(index + 1, index + 4).map(nodeText).join("");
  PLACEHOLDER_RE.lastIndex = 0;
  const matched = PLACEHOLDER_RE.test(following);
  PLACEHOLDER_RE.lastIndex = 0;
  return matched ? 10 : 0;
}

function addOrRepairLink(root, anchorText, href) {
  const existing = descendants(root, (node) => node.type === "element" && node.tag === "a" && nodeText(node).trim() === anchorText);
  if (existing.length > 0) {
    const anchor = existing[0];
    const oldHref = getAttribute(anchor, "href");
    const hadDisallowedAttributes = anchor.attributes.some((attribute) => ["target", "rel"].includes(attribute.name.toLowerCase()));
    const alreadyCorrect = oldHref === href && !hadDisallowedAttributes;
    if (!alreadyCorrect) setAnchorHref(anchor, href);
    return { found: true, alreadyCorrect, repairedExisting: !alreadyCorrect, markerPreferred: false };
  }

  const candidates = descendants(root, (node) => node.type === "text" && node.value.includes(anchorText) && !hasExcludedAncestor(node));
  candidates.sort((left, right) => siblingMarkerScore(right) - siblingMarkerScore(left));
  const textNode = candidates[0];
  if (!textNode) return { found: false, alreadyCorrect: false, repairedExisting: false, markerPreferred: false };
  const markerScore = siblingMarkerScore(textNode);
  const index = markerScore > 0 ? textNode.value.lastIndexOf(anchorText) : textNode.value.indexOf(anchorText);
  const parent = textNode.parent;
  const position = parent.children.indexOf(textNode);
  const before = textNode.value.slice(0, index);
  const after = textNode.value.slice(index + anchorText.length);
  const replacements = [];
  if (before) replacements.push({ type: "text", value: before, parent });
  const anchor = {
    type: "element",
    tag: "a",
    rawOpen: "",
    rawClose: "</a>",
    attributes: [{ name: "href", value: href }],
    children: [],
    parent,
    modifiedOpen: true,
  };
  anchor.children.push({ type: "text", value: anchorText, parent: anchor });
  replacements.push(anchor);
  if (after) replacements.push({ type: "text", value: after, parent });
  parent.children.splice(position, 1, ...replacements);
  return { found: true, alreadyCorrect: false, repairedExisting: false, markerPreferred: markerScore > 0 };
}

function removePlaceholders(root) {
  let count = 0;
  for (const node of descendants(root, (candidate) => candidate.type === "text")) {
    node.value = node.value.replace(PLACEHOLDER_RE, () => {
      count += 1;
      return "";
    });
  }
  let removedEmpty;
  do {
    removedEmpty = false;
    for (const node of descendants(root, (candidate) => candidate.type === "element" && ["strong", "b", "span", "u", "em", "i"].includes(candidate.tag))) {
      if (nodeText(node).trim() || node.children.some((child) => child.type === "element")) continue;
      const parent = node.parent;
      const index = parent.children.indexOf(node);
      if (index >= 0) {
        parent.children.splice(index, 1);
        removedEmpty = true;
      }
    }
  } while (removedEmpty);
  return count;
}

function snippet(html, anchorText) {
  const index = html.indexOf(anchorText);
  if (index < 0) return html.slice(0, 240);
  return html.slice(Math.max(0, index - 110), Math.min(html.length, index + anchorText.length + 130));
}

function linkedSnippet(html, anchorText, href) {
  const needle = `<a href="${href}">${anchorText}</a>`;
  const index = html.indexOf(needle);
  if (index < 0) return snippet(html, anchorText);
  return html.slice(Math.max(0, index - 110), Math.min(html.length, index + needle.length + 130));
}

function readAuditFiles() {
  if (!fs.existsSync(urlMapPath)) throw new Error(`URL map not found: ${urlMapPath}`);
  if (!fs.existsSync(anomalyPath)) throw new Error(`URL anomaly report not found: ${anomalyPath}`);
  const urlMap = JSON.parse(fs.readFileSync(urlMapPath, "utf8"));
  const anomalyReport = JSON.parse(fs.readFileSync(anomalyPath, "utf8"));
  return { urlMap, anomalyReport };
}

async function main() {
  const { urlMap, anomalyReport } = readAuditFiles();
  if (applyMode && Number(anomalyReport.anomalyCount || 0) > 0) {
    throw new Error(`Apply refused: URL audit contains ${anomalyReport.anomalyCount} anomalies.`);
  }
  for (const title of TARGET_TERMS) {
    const item = urlMap[title];
    if (!item || item.status !== 200 || item.canonical !== item.url || item.canonicalStatus !== 200 || item.publishedStatus !== "approved") {
      throw new Error(`URL map is incomplete or unverified for ${title}.`);
    }
  }

  const articles = await prisma.article.findMany({
    where: {
      OR: [
        { categoryHref: { startsWith: "/dictionary" } },
        { subHref: { startsWith: "/dictionary" } },
      ],
    },
    select: { id: true, title: true, slug: true, status: true, content: true, updatedAt: true },
  });
  const byNormalizedTitle = new Map();
  for (const row of articles) {
    const key = normalizeTermTitle(row.title);
    byNormalizedTitle.set(key, [...(byNormalizedTitle.get(key) ?? []), row]);
  }
  const records = new Map();
  for (const title of TARGET_TERMS) {
    const matches = byNormalizedTitle.get(normalizeTermTitle(title)) ?? [];
    if (matches.length !== 1 || matches[0].status !== "approved") {
      throw new Error(`Expected one approved record for ${title}; found ${matches.length}.`);
    }
    records.set(title, matches[0]);
  }

  const plansBySource = new Map();
  for (const plan of LINK_PLANS) plansBySource.set(plan.source, [...(plansBySource.get(plan.source) ?? []), plan]);
  const updates = [];
  const changes = [];
  const missingAnchors = [];
  const idempotenceFailures = [];
  const nestedAnchorFailures = [];
  let removedPlaceholderCount = 0;

  for (const [sourceTitle, plans] of plansBySource) {
    const source = records.get(sourceTitle);
    const original = source.content;
    const root = parseHtmlFragment(original);
    const sourceChanges = [];
    for (const plan of plans) {
      const target = urlMap[plan.target];
      const result = addOrRepairLink(root, plan.target, target.url);
      if (!result.found) {
        missingAnchors.push({ sourceTitle, sourceContentId: source.id, anchorText: plan.target, forced: plan.forced });
        continue;
      }
      const change = {
        sourceTitle,
        sourceContentId: source.id,
        anchorText: plan.target,
        targetTitle: plan.target,
        targetUrl: target.url,
        forcedBackfill: plan.forced,
        removedPlaceholder: false,
        alreadyCorrect: result.alreadyCorrect,
        repairedExistingLink: result.repairedExisting,
        markerPreferred: result.markerPreferred,
        oldSnippet: snippet(original, plan.target),
        newSnippet: null,
      };
      changes.push(change);
      sourceChanges.push(change);
    }
    const placeholderCount = removePlaceholders(root);
    removedPlaceholderCount += placeholderCount;
    for (const change of sourceChanges) change.removedPlaceholder = placeholderCount > 0;
    const content = serialize(root);
    for (const change of sourceChanges) change.newSnippet = linkedSnippet(content, change.anchorText, change.targetUrl);
    const nestedAnchors = descendants(root, (node) => node.type === "element" && node.tag === "a" && descendants(node, (child) => child.type === "element" && child.tag === "a").length > 0);
    if (nestedAnchors.length > 0) nestedAnchorFailures.push({ sourceTitle, sourceContentId: source.id, count: nestedAnchors.length });
    const secondRoot = parseHtmlFragment(content);
    removePlaceholders(secondRoot);
    for (const plan of plans) addOrRepairLink(secondRoot, plan.target, urlMap[plan.target].url);
    if (serialize(secondRoot) !== content) idempotenceFailures.push({ sourceTitle, sourceContentId: source.id });
    if (content !== original) updates.push({ id: source.id, title: source.title, slug: source.slug, oldContent: original, content });
  }

  const residualPlaceholders = [];
  for (const row of records.values()) {
    const updated = updates.find((item) => item.id === row.id);
    const content = updated?.content ?? row.content;
    const matches = content.match(PLACEHOLDER_RE) ?? [];
    if (matches.length > 0) residualPlaceholders.push({ contentId: row.id, title: row.title, matches });
  }
  if (missingAnchors.length > 0 || residualPlaceholders.length > 0 || idempotenceFailures.length > 0 || nestedAnchorFailures.length > 0) {
    const failureReport = {
      generatedAt: new Date().toISOString(), mode: applyMode ? "apply" : "dry-run", applied: false,
      updateCount: updates.length, changeCount: changes.length, missingAnchors, residualPlaceholders, idempotenceFailures, nestedAnchorFailures, changes,
    };
    const file = writeJson(reportPath, failureReport);
    throw new Error(`Backfill validation failed; see ${file}`);
  }

  let backupFile = null;
  if (applyMode && updates.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupFile = writeJson(String(args.backup || `scripts/output/backups/dictionary-links-${timestamp}.json`), {
      createdAt: new Date().toISOString(),
      records: updates.map(({ id, title, slug, oldContent }) => ({ id, title, slug, content: oldContent })),
    });
    await prisma.$transaction(updates.map((update) => prisma.article.update({
      where: { id: update.id },
      data: { content: update.content },
      select: { id: true },
    })));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: dryRunMode ? "dry-run" : "apply",
    applied: applyMode,
    backupFile,
    auditAnomalyCount: Number(anomalyReport.anomalyCount || 0),
    updateCount: updates.length,
    changeCount: changes.length,
    plannedChanges: changes.filter((change) => !change.alreadyCorrect || change.removedPlaceholder).length,
    unchangedLinkCount: changes.filter((change) => change.alreadyCorrect && !change.removedPlaceholder).length,
    removedPlaceholderCount,
    repairedExistingLinkCount: changes.filter((change) => change.repairedExistingLink).length,
    missingAnchors,
    residualPlaceholders,
    idempotent: idempotenceFailures.length === 0,
    idempotenceFailures,
    nestedAnchorFailures,
    updates: updates.map(({ id, title, slug }) => ({ id, title, slug, field: "content" })),
    changes,
  };
  const file = writeJson(reportPath, report);
  console.log(JSON.stringify({ reportFile: file, mode: report.mode, updateCount: report.updateCount, changeCount: report.changeCount, plannedChanges: report.plannedChanges, unchangedLinkCount: report.unchangedLinkCount, removedPlaceholderCount: report.removedPlaceholderCount, auditAnomalyCount: report.auditAnomalyCount }, null, 2));
}

main().finally(() => prisma.$disconnect());
