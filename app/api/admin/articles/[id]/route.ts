import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { normalizeRichTextField } from "@/lib/brand-content";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canChangeReviewStatus,
  canDirectlyDeleteArticle,
  canDirectlyEditArticle,
  canReviewSubmissions,
} from "@/lib/content-permissions";
import { findDuplicateArticleByTitle, normalizeArticleTitle } from "@/lib/article-title";
import { formatKeywordCsv, syncArticleKeywords } from "@/lib/news-keywords-v2";
import { buildNewsPath } from "@/lib/share-config";
import { pushApprovedNewsToBaidu } from "@/lib/baidu-submit";
import { buildDirtyTextErrorMessage } from "@/lib/article-input-guard";
import { parseProductRecommendations, stringifyProductRecommendations } from "@/lib/news-aftermarket";
import { validateInternalLinks } from "@/lib/article-links";
import { revalidateBuyingArticlePaths } from "@/lib/buying-summary";

function isAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}

function canAccessAdminArticleDetail(
  session: Awaited<ReturnType<typeof getSession>>,
  article: { authorMemberId: string | null },
) {
  if (!session) return false;
  if (canReviewSubmissions(session)) return true;
  return article.authorMemberId === session.sub && canDirectlyEditArticle(session, article);
}

async function revalidateArticlePaths(article: {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  categoryHref?: string | null;
  subHref?: string | null;
  ownedEnterpriseId?: string | null;
}) {
  const segment = (article.slug || article.title || "").trim();
  const isDictionary =
    article.categoryHref?.startsWith("/dictionary") || article.subHref?.startsWith("/dictionary");

  if (isDictionary) {
    revalidatePath("/dictionary");
    revalidatePath("/dictionary/all");
    if (segment) {
      revalidatePath(`/dictionary/${encodeURIComponent(segment)}`);
    }
  }

  const isNews = article.categoryHref?.startsWith("/news") || article.subHref?.startsWith("/news");
  if (isNews) {
    revalidatePath("/news");
    revalidatePath("/news/all");
    revalidatePath("/sitemap.xml");
    if (article.subHref) {
      revalidatePath(article.subHref);
    }
    if (article.id) {
      revalidatePath(buildNewsPath(article.slug || article.id));
    }
    if (segment) {
      revalidatePath(`/news/${encodeURIComponent(segment)}`);
    }
  }

  const isBuying =
    article.categoryHref?.startsWith("/brands/buying") || article.subHref?.startsWith("/brands/buying");
  if (isBuying) {
    try {
      await revalidateBuyingArticlePaths(article);
    } catch (error) {
      console.error("admin article buying revalidate failed:", error);
    }
  }

  if (article.ownedEnterpriseId) {
    revalidatePath(`/enterprise/${article.ownedEnterpriseId}`);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { id } = await params;
  const article = await prisma.article.findUnique({
    where: { id },
    select: {
      id: true,
      authorMemberId: true,
      title: true,
      slug: true,
      sourceType: true,
      source: true,
      generationBatchId: true,
      keywordSeed: true,
      keywordIntent: true,
      sourceUrl: true,
      displayAuthor: true,
      categoryHref: true,
      subHref: true,
      publishedAt: true,
      excerpt: true,
      content: true,
      coverImage: true,
      tagSlugs: true,
      keywords: true,
      manualKeywords: true,
      recommendIds: true,
      productRecommendations: true,
      isPinned: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      reviewedById: true,
      updatedAt: true,
      createdAt: true,
      conceptSummary: true,
      applicableScenarios: true,
      versionLabel: true,
      relatedTermSlugs: true,
      relatedStandardIds: true,
      relatedBrandIds: true,
      ownedEnterpriseId: true,
      faqJson: true,
      syncToMainSite: true,
    },
  });
  if (!article) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }
  if (!canAccessAdminArticleDetail(session, article)) {
    return NextResponse.json({ error: "当前账号没有查看该内容详情的权限" }, { status: 403 });
  }
  return NextResponse.json(article);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.article.findUnique({
    where: { id },
    select: {
      id: true,
      authorMemberId: true,
      status: true,
      publishedAt: true,
      content: true,
      manualKeywords: true,
      categoryHref: true,
      subHref: true,
      ownedEnterpriseId: true,
    },
  });
  if (!target) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }
  if (!canAccessAdminArticleDetail(session, target)) {
    return NextResponse.json({ error: "当前账号没有修改该内容的权限" }, { status: 403 });
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
    faqJson,
    syncToMainSite,
    isPinned,
    status,
    reviewNote,
    manualKeywords,
    recommendIds,
    productRecommendations,
  } = body;

  const canReview = canReviewSubmissions(session);
  if (!canReview) {
    if (typeof status === "string") {
      return NextResponse.json({ error: "当前账号没有审核或修改状态的权限" }, { status: 403 });
    }
    if (typeof reviewNote === "string") {
      return NextResponse.json({ error: "当前账号没有填写审核备注的权限" }, { status: 403 });
    }
  }

  const data: Record<string, unknown> = {};
  if (typeof title === "string") data.title = normalizeArticleTitle(title);
  if (typeof slug === "string") {
    const normalizedSlug = slug.trim();
    if (normalizedSlug) {
      const existing = await prisma.article.findFirst({
        where: { slug: normalizedSlug, NOT: { id } },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ error: "Slug 已存在，请更换一个新的 slug" }, { status: 400 });
      }
      data.slug = normalizedSlug;
    }
  }
  if (typeof excerpt === "string") data.excerpt = excerpt.trim() || null;
  if (typeof source === "string") data.source = source.trim() || null;
  if (typeof sourceUrl === "string") data.sourceUrl = sourceUrl.trim() || null;
  if (typeof displayAuthor === "string") data.displayAuthor = displayAuthor.trim() || null;
  if (typeof content === "string") {
    data.content = normalizeRichTextField(content) ?? "";
  }
  if (typeof coverImage === "string") data.coverImage = coverImage.trim() || null;
  if (typeof subHref === "string") data.subHref = subHref.trim() || null;
  if (typeof categoryHref === "string") data.categoryHref = categoryHref.trim() || null;
  if (typeof conceptSummary === "string") data.conceptSummary = conceptSummary.trim() || null;
  if (typeof applicableScenarios === "string") data.applicableScenarios = applicableScenarios.trim() || null;
  if (typeof versionLabel === "string") data.versionLabel = versionLabel.trim() || null;
  if (typeof relatedTermSlugs === "string") data.relatedTermSlugs = relatedTermSlugs.trim() || null;
  if (typeof relatedStandardIds === "string") data.relatedStandardIds = relatedStandardIds.trim() || null;
  if (typeof relatedBrandIds === "string") data.relatedBrandIds = relatedBrandIds.trim() || null;
  if (ownedEnterpriseId === null || (typeof ownedEnterpriseId === "string" && !ownedEnterpriseId.trim())) {
    data.ownedEnterpriseId = null;
  } else if (typeof ownedEnterpriseId === "string") {
    const normalizedOwnedEnterpriseId = ownedEnterpriseId.trim();
    const ownedEnterprise = await prisma.enterprise.findUnique({
      where: { id: normalizedOwnedEnterpriseId },
      select: { id: true },
    });
    if (!ownedEnterprise) {
      return NextResponse.json({ error: "归属企业不存在或已被删除" }, { status: 400 });
    }
    data.ownedEnterpriseId = normalizedOwnedEnterpriseId;
  }
  if (typeof tagSlugs === "string") data.tagSlugs = tagSlugs.trim() || null;
  if (typeof manualKeywords === "string") {
    data.manualKeywords = formatKeywordCsv(manualKeywords.split(/[,\n，]+/)) || null;
  }
  if (typeof recommendIds === "string") data.recommendIds = recommendIds.trim() || null;
  if (typeof productRecommendations === "string") {
    data.productRecommendations = stringifyProductRecommendations(parseProductRecommendations(productRecommendations));
  }
  if (typeof faqJson === "string") data.faqJson = faqJson.trim() || null;
  if (typeof isPinned === "boolean") data.isPinned = isPinned;
  if (syncToMainSite !== undefined) data.syncToMainSite = syncToMainSite === true;

  if (publishedAt !== undefined) {
    data.publishedAt =
      publishedAt === true || publishedAt === "true"
        ? new Date()
        : publishedAt
          ? new Date(publishedAt)
          : null;
  }

  if (typeof status === "string" && ["draft", "pending", "approved", "rejected"].includes(status)) {
    if (!canChangeReviewStatus(session)) {
      return NextResponse.json({ error: "当前账号没有审核状态变更权限" }, { status: 403 });
    }
    data.status = status;
    data.reviewedAt = status === "approved" || status === "rejected" ? new Date() : null;
    data.reviewedById = session.sub;
    if (status === "approved" && publishedAt === undefined && !target.publishedAt) {
      data.publishedAt = new Date();
    }
  }
  if (typeof reviewNote === "string") data.reviewNote = reviewNote.trim() || null;

  if (typeof data.title === "string") {
    const existingTitle = await findDuplicateArticleByTitle(data.title, id);
    if (existingTitle) {
      return NextResponse.json({ error: "标题已存在，请更换一个新的标题" }, { status: 400 });
    }
  }

  const dirtyTextError = buildDirtyTextErrorMessage([
    { label: "标题", value: typeof data.title === "string" ? data.title : null },
    { label: "摘要", value: typeof data.excerpt === "string" ? data.excerpt : null },
    { label: "正文", value: typeof data.content === "string" ? data.content : null },
    { label: "作者", value: typeof data.displayAuthor === "string" ? data.displayAuthor : null },
    { label: "来源", value: typeof data.source === "string" ? data.source : null },
    { label: "概念总结", value: typeof data.conceptSummary === "string" ? data.conceptSummary : null },
    { label: "适用场景", value: typeof data.applicableScenarios === "string" ? data.applicableScenarios : null },
    { label: "版本标签", value: typeof data.versionLabel === "string" ? data.versionLabel : null },
    { label: "手工关键词", value: typeof data.manualKeywords === "string" ? data.manualKeywords : null },
  ]);
  if (dirtyTextError) {
    return NextResponse.json({ error: dirtyTextError }, { status: 400 });
  }

  const nextStatus = typeof data.status === "string" ? data.status : target.status;
  const nextContent = typeof data.content === "string" ? data.content : target.content;
  const nextManualKeywords =
    typeof data.manualKeywords === "string"
      ? data.manualKeywords
      : data.manualKeywords === null
        ? ""
        : target.manualKeywords;

  if (nextStatus === "approved" && nextContent) {
    const linkValidation = await validateInternalLinks({
      html: nextContent,
      keywordCsv: nextManualKeywords,
    });
    if (!linkValidation.ok) {
      return NextResponse.json(
        { error: `站内链接校验未通过：${linkValidation.broken.map((item) => item.href).join("、")}` },
        { status: 400 },
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "请提供要更新的字段" }, { status: 400 });
  }
  if (typeof data.status !== "string" && !canDirectlyEditArticle(session, target)) {
    return NextResponse.json({ error: "当前账号没有直接修改权限，请提交修改申请" }, { status: 403 });
  }

  const article = await prisma.article.update({
    where: { id },
    data,
    select: {
      id: true,
      slug: true,
      title: true,
      sourceType: true,
      source: true,
      generationBatchId: true,
      keywordSeed: true,
      keywordIntent: true,
      sourceUrl: true,
      displayAuthor: true,
      categoryHref: true,
      subHref: true,
      authorMemberId: true,
      publishedAt: true,
      excerpt: true,
      content: true,
      coverImage: true,
      tagSlugs: true,
      keywords: true,
      manualKeywords: true,
      recommendIds: true,
      productRecommendations: true,
      isPinned: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      reviewedById: true,
      updatedAt: true,
      createdAt: true,
      conceptSummary: true,
      applicableScenarios: true,
      versionLabel: true,
      relatedTermSlugs: true,
      relatedStandardIds: true,
      relatedBrandIds: true,
      ownedEnterpriseId: true,
      ownedEnterprise: {
        select: {
          id: true,
          companyName: true,
          companyShortName: true,
        },
      },
      faqJson: true,
      syncToMainSite: true,
    },
  });

  if (
    typeof data.title === "string" ||
    typeof data.content === "string" ||
    typeof data.manualKeywords === "string" ||
    data.manualKeywords === null
  ) {
    await syncArticleKeywords({
      articleId: article.id,
      title: article.title,
      content: article.content,
      manualKeywords: article.manualKeywords,
    });
  }

  await revalidateArticlePaths(article);

  if (typeof data.status === "string") {
    await writeOperationLog({
      actorId: session.sub,
      actorEmail: session.email,
      action: "article_review_status_change",
      targetType: "article",
      targetId: id,
      detail: JSON.stringify({ status: data.status }),
    });
  }

  if (data.status === "approved" && target.status !== "approved") {
    await pushApprovedNewsToBaidu(
      {
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content,
        status: article.status,
        categoryHref: article.categoryHref,
        subHref: article.subHref,
      },
      {
        actorId: session.sub,
        actorEmail: session.email,
        source: "admin_article_patch",
      },
    ).catch((error) => {
      console.error("admin article review baidu push failed:", error);
    });
  }

  return NextResponse.json(article);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.article.findUnique({
    where: { id },
    select: { id: true, authorMemberId: true },
  });
  if (!target) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }
  if (!canDirectlyDeleteArticle(session, target)) {
    return NextResponse.json({ error: "当前账号没有删除权限" }, { status: 403 });
  }

  await prisma.article.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
