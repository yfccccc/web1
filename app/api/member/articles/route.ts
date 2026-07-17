import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { defaultContentStatusForSubmission } from "@/lib/member-access";
import { writeOperationLog } from "@/lib/operation-log";
import {
  buildContentTabWhere,
  MEMBER_ALLOWED_CATEGORY_HREFS,
  MEMBER_PUBLISH_CATEGORY_OPTIONS,
  type ContentTabKey,
} from "@/lib/content-taxonomy";
import { resolveTagSlugs } from "@/lib/tag-suggest";
import { generateUniqueArticleSlug } from "@/lib/slug";
import { isContentReviewRequired } from "@/lib/app-settings";
import { normalizeRichTextField } from "@/lib/brand-content";
import { findDuplicateArticleByTitle, normalizeArticleTitle } from "@/lib/article-title";
import { formatKeywordCsv, syncArticleKeywords } from "@/lib/news-keywords-v2";
import {
  findEffectiveCategoryAccess,
  findEffectiveSubcategoryAccess,
  getEffectiveMemberAccessForMember,
} from "@/lib/member-access-resolver";
import { buildDirtyTextErrorMessage } from "@/lib/article-input-guard";
import { validateInternalLinks } from "@/lib/article-links";
import { revalidateBuyingArticlePaths } from "@/lib/buying-summary";

const MEMBER_CONTENT_STATUSES = new Set(["draft", "pending", "approved", "rejected"]);

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim() ?? "";
  const tab = searchParams.get("tab")?.trim() ?? "";

  const where: any = { authorMemberId: session.sub };
  if (status && MEMBER_CONTENT_STATUSES.has(status)) {
    where.status = status;
  }

  const tabWhere = buildContentTabWhere(tab);
  if (tabWhere) {
    where.AND = [...(where.AND ?? []), tabWhere];
  }

  if (q) {
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
          { excerpt: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
          { source: { contains: q, mode: "insensitive" } },
          { displayAuthor: { contains: q, mode: "insensitive" } },
          { tagSlugs: { contains: q, mode: "insensitive" } },
          { keywords: { contains: q, mode: "insensitive" } },
          { manualKeywords: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.article.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const memberAccess = await getEffectiveMemberAccessForMember(session.sub, session.memberType);
  const membershipRule = memberAccess.membershipRule;

  const reviewRequired = await isContentReviewRequired();
  const submissionStatus = defaultContentStatusForSubmission({
    reviewRequired,
    role: session.role,
    canPublishWithoutReview: session.canPublishWithoutReview === true,
  });

  const body = await request.json().catch(() => ({}));
  const {
    title,
    slug,
    excerpt,
    content,
    coverImage,
    subHref,
    categoryHref,
    source,
    sourceUrl,
    displayAuthor,
    relatedTermSlugs,
    relatedStandardIds,
    relatedBrandIds,
    tagSlugs,
    manualKeywords,
    faqJson,
    syncToMainSite,
    isPinned,
  } = body;

  const categoryHrefTrim =
    typeof categoryHref === "string" ? categoryHref.trim() : "";
  if (!MEMBER_ALLOWED_CATEGORY_HREFS.has(categoryHrefTrim)) {
    return NextResponse.json({ error: "栏目非法或不支持投稿" }, { status: 400 });
  }

  const categoryAccess = findEffectiveCategoryAccess(memberAccess, categoryHrefTrim);
  if (!categoryAccess?.enabled) {
    return NextResponse.json({ error: `${membershipRule.label}当前未开通该栏目投稿权限` }, { status: 403 });
  }

  const categoryDef = MEMBER_PUBLISH_CATEGORY_OPTIONS.find((item) => item.href === categoryHrefTrim);
  const rawSubHref = typeof subHref === "string" ? subHref.trim() : "";
  const normalizedSyncToMainSite = syncToMainSite === true;
  const memberEnterprise = await prisma.enterprise.findUnique({
    where: { memberId: session.sub },
    select: { id: true },
  });
  const normalizedSubHref =
    categoryHrefTrim === "/news" && memberEnterprise
      ? normalizedSyncToMainSite
        ? "/news/enterprise"
        : rawSubHref || "/news/enterprise"
      : rawSubHref || null;

  if (categoryDef && categoryDef.subs.length > 0) {
    if (!normalizedSubHref) {
      return NextResponse.json({ error: "请选择子栏目" }, { status: 400 });
    }

    const subcategoryExists = categoryDef.subs.some((item) => item.href === normalizedSubHref);
    if (!subcategoryExists) {
      return NextResponse.json({ error: "子栏目非法或不支持投稿" }, { status: 400 });
    }

    const subcategoryAccess = findEffectiveSubcategoryAccess(memberAccess, categoryHrefTrim, normalizedSubHref);
    if (!subcategoryAccess?.enabled) {
      return NextResponse.json({ error: `${membershipRule.label}当前未开通该子栏目投稿权限` }, { status: 403 });
    }

    if (subcategoryAccess.annualLimit != null && subcategoryAccess.usedCount >= subcategoryAccess.annualLimit) {
      return NextResponse.json(
        { error: `当前子栏目年度发布额度已用完（${subcategoryAccess.annualLimit}篇）` },
        { status: 400 }
      );
    }
  }

  if (categoryAccess.annualLimit != null && categoryAccess.usedCount >= categoryAccess.annualLimit) {
    return NextResponse.json({ error: `当前栏目年度发布额度已用完（${categoryAccess.annualLimit}篇）` }, { status: 400 });
  }

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "标题必填" }, { status: 400 });
  }
  const normalizedTitle = normalizeArticleTitle(title);
  const existingTitle = await findDuplicateArticleByTitle(normalizedTitle);
  if (existingTitle) {
    return NextResponse.json({ error: "标题已存在，请更换一个新的标题" }, { status: 400 });
  }
  const normalizedContent = normalizeRichTextField(content) ?? "";
  const dirtyTextError = buildDirtyTextErrorMessage([
    { label: "标题", value: normalizedTitle },
    { label: "摘要", value: typeof excerpt === "string" ? excerpt.trim() : null },
    { label: "正文", value: normalizedContent },
    { label: "作者", value: typeof displayAuthor === "string" ? displayAuthor.trim() : null },
    { label: "来源", value: typeof source === "string" ? source.trim() : null },
    { label: "手工关键词", value: typeof manualKeywords === "string" ? manualKeywords.trim() : null },
  ]);
  if (dirtyTextError) {
    return NextResponse.json({ error: dirtyTextError }, { status: 400 });
  }
  const linkValidation = await validateInternalLinks({
    html: normalizedContent,
    keywordCsv: typeof manualKeywords === "string" ? manualKeywords.trim() : null,
  });
  if (submissionStatus === "approved" && !linkValidation.ok) {
    return NextResponse.json(
      { error: `站内链接校验未通过：${linkValidation.broken.map((item) => item.href).join("、")}` },
      { status: 400 },
    );
  }
  const customSlug = typeof slug === "string" ? slug.trim() : "";
  const slugTrim = await generateUniqueArticleSlug(customSlug || title);

  const resolvedTagSlugs = resolveTagSlugs({
    manualTagInput: typeof tagSlugs === "string" ? tagSlugs : null,
    title: typeof title === "string" ? title : null,
    excerpt: typeof excerpt === "string" ? excerpt : null,
    content: typeof content === "string" ? content : null,
    categoryHref: categoryHrefTrim,
    subHref: typeof subHref === "string" ? subHref : null,
  });

  const article = await prisma.article.create({
    data: {
      title: normalizedTitle,
      slug: slugTrim,
      sourceType: "manual",
      source: typeof source === "string" ? source.trim() || null : null,
      sourceUrl: typeof sourceUrl === "string" ? sourceUrl.trim() || null : null,
      displayAuthor: typeof displayAuthor === "string" ? displayAuthor.trim() || null : null,
      excerpt: typeof excerpt === "string" ? excerpt.trim() || null : null,
      content: normalizedContent,
      coverImage: typeof coverImage === "string" ? coverImage.trim() || null : null,
      subHref: normalizedSubHref,
      categoryHref: categoryHrefTrim,
      relatedTermSlugs:
        membershipRule.canLinkTerms && typeof relatedTermSlugs === "string"
          ? relatedTermSlugs.trim() || null
          : null,
      relatedStandardIds:
        membershipRule.canLinkStandards && typeof relatedStandardIds === "string"
          ? relatedStandardIds.trim() || null
          : null,
      relatedBrandIds: typeof relatedBrandIds === "string" ? relatedBrandIds.trim() || null : null,
      faqJson: typeof faqJson === "string" ? faqJson.trim() || null : null,
      tagSlugs: resolvedTagSlugs.length > 0 ? resolvedTagSlugs.join(",") : null,
      manualKeywords: typeof manualKeywords === "string" ? formatKeywordCsv(manualKeywords.split(/[,\n，]+/)) || null : null,
      syncToMainSite: normalizedSyncToMainSite,
      isPinned: (session.role === "SUPER_ADMIN" || session.role === "ADMIN") && isPinned === true,
      publishedAt: submissionStatus === "approved" ? new Date() : null,
      status: submissionStatus,
      authorMemberId: session.sub,
    },
  });

  await syncArticleKeywords({
    articleId: article.id,
    title: normalizedTitle,
    content: normalizedContent,
    manualKeywords: typeof manualKeywords === "string" ? manualKeywords : null,
  });

  await writeOperationLog({
    actorId: session.sub,
    actorEmail: session.email,
    action: "member_article_submit",
    targetType: "article",
    targetId: article.id,
    detail: JSON.stringify({ status: article.status, memberType: session.memberType }),
  });

  const isBuying =
    article.status === "approved" &&
    (article.categoryHref?.startsWith("/brands/buying") || article.subHref?.startsWith("/brands/buying"));
  if (isBuying) {
    try {
      await revalidateBuyingArticlePaths(article);
    } catch (error) {
      console.error("member article create buying revalidate failed:", error);
    }
  }

  return NextResponse.json(article);
}
