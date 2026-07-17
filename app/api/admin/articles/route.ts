import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { defaultContentStatusForSubmission } from "@/lib/member-access";
import { normalizeRichTextField } from "@/lib/brand-content";
import { resolveTagSlugs } from "@/lib/tag-suggest";
import { generateUniqueArticleSlug } from "@/lib/slug";
import { isContentReviewRequired } from "@/lib/app-settings";
import { findDuplicateArticleByTitle, normalizeArticleTitle } from "@/lib/article-title";
import { formatKeywordCsv, syncArticleKeywords } from "@/lib/news-keywords-v2";
import { resolveTabKeyFromHref } from "@/lib/content-taxonomy";
import { buildContentTabWhere } from "@/lib/content-taxonomy";
import { pushApprovedNewsToBaidu } from "@/lib/baidu-submit";
import { isArticleSourceType } from "@/lib/article-source";
import { buildDirtyTextErrorMessage } from "@/lib/article-input-guard";
import { parseProductRecommendations, stringifyProductRecommendations } from "@/lib/news-aftermarket";
import { validateInternalLinks } from "@/lib/article-links";
import { canReviewSubmissions } from "@/lib/content-permissions";

export const dynamic = "force-dynamic";

function getMutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
      if (target.includes("title")) return "标题已存在，请更换一个新的标题";
      if (target.includes("slug")) return "Slug 已存在，请更换一个新的 slug";
      return "存在重复数据，请检查标题或 slug";
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return `${fallback}：${message}`;
  }

  return fallback;
}

function isAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}

function isSuperAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;

  const status = searchParams.get("status");
  const categoryHref = searchParams.get("categoryHref");
  const tab = searchParams.get("tab");
  const sourceType = searchParams.get("sourceType");
  const q = searchParams.get("q")?.trim();
  const where: any = {};
  if (!canReviewSubmissions(session)) {
    where.authorMemberId = session.sub;
  }
  if (status && ["draft", "pending", "approved", "rejected"].includes(status)) {
    where.status = status;
  }
  const resolvedTab =
    typeof tab === "string" && tab.trim()
      ? tab.trim()
      : typeof categoryHref === "string" && categoryHref.trim()
        ? resolveTabKeyFromHref(categoryHref, null)
        : "";
  const tabWhere = buildContentTabWhere(resolvedTab);
  if (tabWhere) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), tabWhere];
  }
  if (isArticleSourceType(sourceType)) {
    where.sourceType = sourceType;
  }
  if (q) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
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
          { keywordItems: { some: { keyword: { contains: q, mode: "insensitive" } } } },
          {
            authorMember: {
              is: {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          },
          {
            ownedEnterprise: {
              is: {
                OR: [
                  { companyName: { contains: q, mode: "insensitive" } },
                  { companyShortName: { contains: q, mode: "insensitive" } },
                  { brand: { is: { name: { contains: q, mode: "insensitive" } } } },
                ],
              },
            },
          },
        ],
      },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { updatedAt: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        sourceType: true,
        source: true,
        generationBatchId: true,
        keywordSeed: true,
        keywordIntent: true,
        sourceUrl: true,
        displayAuthor: true,
        excerpt: true,
        content: true,
        coverImage: true,
        subHref: true,
        categoryHref: true,
        tagSlugs: true,
        keywords: true,
        manualKeywords: true,
        recommendIds: true,
        productRecommendations: true,
        faqJson: true,
        isPinned: true,
        publishedAt: true,
        viewCount: true,
        status: true,
        ownedEnterpriseId: true,
        ownedEnterprise: {
          select: {
            id: true,
            companyName: true,
            companyShortName: true,
          },
        },
        authorMember: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),
    prisma.article.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !canReviewSubmissions(session)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      title,
      slug,
      excerpt,
      content,
      coverImage,
      subHref,
      categoryHref,
      publishedAt,
      source,
      sourceUrl,
      displayAuthor,
      conceptSummary,
      applicableScenarios,
      versionLabel,
      relatedTermSlugs,
      relatedStandardIds,
      relatedBrandIds,
      ownedEnterpriseId,
      tagSlugs,
      manualKeywords,
      recommendIds,
      productRecommendations,
      faqJson,
      syncToMainSite,
      isPinned,
      status,
      reviewNote,
    } = body;

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
      { label: "概念总结", value: typeof conceptSummary === "string" ? conceptSummary.trim() : null },
      { label: "适用场景", value: typeof applicableScenarios === "string" ? applicableScenarios.trim() : null },
      { label: "版本标签", value: typeof versionLabel === "string" ? versionLabel.trim() : null },
      { label: "手工关键词", value: typeof manualKeywords === "string" ? manualKeywords.trim() : null },
    ]);
    if (dirtyTextError) {
      return NextResponse.json({ error: dirtyTextError }, { status: 400 });
    }
    const linkValidation = await validateInternalLinks({
      html: normalizedContent,
      keywordCsv: typeof manualKeywords === "string" ? manualKeywords.trim() : null,
    });
    const customSlug = typeof slug === "string" ? slug.trim() : "";
    const slugTrim = await generateUniqueArticleSlug(customSlug || normalizedTitle);

    const reviewRequired = await isContentReviewRequired();
    const safeStatus = isSuperAdmin(session)
      ? (typeof status === "string" && ["draft", "pending", "approved", "rejected"].includes(status) ? status : "approved")
      : defaultContentStatusForSubmission({
          reviewRequired,
          role: session.role,
          canPublishWithoutReview: session.canPublishWithoutReview === true,
        });
    if (safeStatus === "approved" && !linkValidation.ok) {
      return NextResponse.json(
        { error: `站内链接校验未通过：${linkValidation.broken.map((item) => item.href).join("、")}` },
        { status: 400 },
      );
    }

    const resolvedPublishedAt =
      publishedAt === true || publishedAt === "true"
        ? new Date()
        : publishedAt
          ? new Date(publishedAt)
          : safeStatus === "approved"
            ? new Date()
            : null;

    const resolvedTagSlugs = resolveTagSlugs({
      manualTagInput: typeof tagSlugs === "string" ? tagSlugs : null,
      title: typeof title === "string" ? title : null,
      excerpt: typeof excerpt === "string" ? excerpt : null,
      content: typeof content === "string" ? content : null,
      categoryHref: typeof categoryHref === "string" ? categoryHref : null,
      subHref: typeof subHref === "string" ? subHref : null,
    });

    const normalizedOwnedEnterpriseId =
      typeof ownedEnterpriseId === "string" && ownedEnterpriseId.trim() ? ownedEnterpriseId.trim() : null;

    if (normalizedOwnedEnterpriseId) {
      const ownedEnterprise = await prisma.enterprise.findUnique({
        where: { id: normalizedOwnedEnterpriseId },
        select: { id: true },
      });
      if (!ownedEnterprise) {
        return NextResponse.json({ error: "归属企业不存在或已被删除" }, { status: 400 });
      }
    }

    const article = await prisma.article.create({
      data: {
        title: normalizedTitle,
        slug: slugTrim,
        sourceType: "manual",
        source: typeof source === "string" ? source.trim() || null : null,
        generationBatchId: null,
        keywordSeed: null,
        keywordIntent: null,
        sourceUrl: typeof sourceUrl === "string" ? sourceUrl.trim() || null : null,
        displayAuthor: typeof displayAuthor === "string" ? displayAuthor.trim() || null : null,
        excerpt: typeof excerpt === "string" ? excerpt.trim() || null : null,
        content: normalizedContent,
        coverImage: typeof coverImage === "string" ? coverImage.trim() || null : null,
        subHref: typeof subHref === "string" ? subHref.trim() || null : null,
        categoryHref: typeof categoryHref === "string" ? categoryHref.trim() || null : null,
        publishedAt: resolvedPublishedAt,
        conceptSummary: typeof conceptSummary === "string" ? conceptSummary.trim() || null : null,
        applicableScenarios: typeof applicableScenarios === "string" ? applicableScenarios.trim() || null : null,
        versionLabel: typeof versionLabel === "string" ? versionLabel.trim() || null : null,
        relatedTermSlugs: typeof relatedTermSlugs === "string" ? relatedTermSlugs.trim() || null : null,
        relatedStandardIds: typeof relatedStandardIds === "string" ? relatedStandardIds.trim() || null : null,
        relatedBrandIds: typeof relatedBrandIds === "string" ? relatedBrandIds.trim() || null : null,
        ownedEnterpriseId: normalizedOwnedEnterpriseId,
        faqJson: typeof faqJson === "string" ? faqJson.trim() || null : null,
        tagSlugs: resolvedTagSlugs.length > 0 ? resolvedTagSlugs.join(",") : null,
        manualKeywords: typeof manualKeywords === "string" ? formatKeywordCsv(manualKeywords.split(/[,\n，]+/)) || null : null,
        recommendIds: typeof recommendIds === "string" ? recommendIds.trim() || null : null,
        productRecommendations:
          typeof productRecommendations === "string"
            ? stringifyProductRecommendations(parseProductRecommendations(productRecommendations))
            : null,
        syncToMainSite: syncToMainSite === true,
        isPinned: typeof isPinned === "boolean" ? isPinned : false,
        status: safeStatus,
        authorMemberId: session.sub,
        reviewNote: typeof reviewNote === "string" ? reviewNote.trim() || null : null,
        reviewedAt: safeStatus === "approved" || safeStatus === "rejected" ? new Date() : null,
        reviewedById: safeStatus === "approved" || safeStatus === "rejected" ? session.sub : null,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        categoryHref: true,
        subHref: true,
        status: true,
        ownedEnterpriseId: true,
        ownedEnterprise: {
          select: {
            id: true,
            companyName: true,
            companyShortName: true,
          },
        },
      },
    });

    try {
      await syncArticleKeywords({
        articleId: article.id,
        title: normalizedTitle,
        content: normalizedContent,
        manualKeywords: typeof manualKeywords === "string" ? manualKeywords : null,
      });
    } catch (keywordError) {
      await prisma.newsKeyword.deleteMany({ where: { newsId: article.id } }).catch(() => undefined);
      await prisma.article.delete({ where: { id: article.id } }).catch(() => undefined);
      const reason = getMutationErrorMessage(keywordError, "关键词同步失败");
      return NextResponse.json(
        { error: `发布失败：${reason}。本次文章未保存，请修正后重试。` },
        { status: 500 },
      );
    }

    await pushApprovedNewsToBaidu(
      {
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: normalizedContent,
        status: article.status,
        categoryHref: article.categoryHref,
        subHref: article.subHref,
      },
      {
        actorId: session.sub,
        actorEmail: session.email,
        source: "admin_article_create",
      },
    ).catch((error) => {
      console.error("admin article baidu push failed:", error);
    });

    if (article.status === "approved" && ((article.categoryHref ?? "").startsWith("/news") || (article.subHref ?? "").startsWith("/news"))) {
      revalidatePath("/sitemap.xml");
    }

    return NextResponse.json(article);
  } catch (e) {
    console.error("POST /api/admin/articles", e);
    const msg = getMutationErrorMessage(e, "发布失败，请稍后重试");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
