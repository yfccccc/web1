import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildArticleDiffSummary, buildArticlePatchData } from "@/lib/article-change";
import { writeOperationLog } from "@/lib/operation-log";
import { normalizeRichTextField } from "@/lib/brand-content";
import { findDuplicateArticleByTitle, normalizeArticleTitle } from "@/lib/article-title";
import { buildDirtyTextErrorMessage } from "@/lib/article-input-guard";
import { canMemberUseArticleLocation, getEffectiveMemberAccessForMember } from "@/lib/member-access-resolver";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const article = await prisma.article.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      coverImage: true,
      categoryHref: true,
      subHref: true,
      authorMemberId: true,
    },
  });
  if (!article) return NextResponse.json({ error: "资讯不存在" }, { status: 404 });
  if (article.authorMemberId !== session.sub) {
    return NextResponse.json({ error: "仅可提交自己资讯的修改申请" }, { status: 403 });
  }

  const memberAccess = await getEffectiveMemberAccessForMember(session.sub, session.memberType);
  const body = await request.json().catch(() => ({}));
  const patch = buildArticlePatchData({
    title: typeof body.title === "string" ? normalizeArticleTitle(body.title) : body.title,
    slug: body.slug,
    excerpt: body.excerpt,
    content: normalizeRichTextField(body.content),
    coverImage: body.coverImage,
    subHref: body.subHref,
    categoryHref: body.categoryHref,
    tagSlugs: body.tagSlugs,
    relatedTermSlugs: body.relatedTermSlugs,
    relatedStandardIds: body.relatedStandardIds,
    relatedBrandIds: body.relatedBrandIds,
  });

  const nextCategoryHref = patch.patchCategoryHref ?? article.categoryHref;
  const nextSubHref = patch.patchSubHref ?? article.subHref;
  if (!canMemberUseArticleLocation(memberAccess, nextCategoryHref, nextSubHref)) {
    return NextResponse.json({ error: "当前账号未开通该栏目或子栏目投稿权限" }, { status: 403 });
  }

  const hasPatch = Object.values(patch).some((v) => v !== null && String(v).trim() !== "");
  if (!hasPatch) {
    return NextResponse.json({ error: "请至少提交一个修改字段" }, { status: 400 });
  }

  if (typeof patch.patchTitle === "string") {
    const existingTitle = await findDuplicateArticleByTitle(patch.patchTitle, article.id);
    if (existingTitle) {
      return NextResponse.json({ error: "标题已存在，请更换一个新的标题" }, { status: 400 });
    }
  }

  const dirtyTextError = buildDirtyTextErrorMessage([
    { label: "标题", value: patch.patchTitle },
    { label: "摘要", value: patch.patchExcerpt },
    { label: "正文", value: patch.patchContent },
  ]);
  if (dirtyTextError) {
    return NextResponse.json({ error: dirtyTextError }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const diffSummary = buildArticleDiffSummary(article, patch);

  const created = await prisma.articleChangeRequest.create({
    data: {
      articleId: article.id,
      submitterId: session.sub,
      reason: reason || null,
      ...patch,
      diffSummary: diffSummary || null,
      status: "pending",
    },
  });

  await writeOperationLog({
    actorId: session.sub,
    actorEmail: session.email,
    action: "article_change_request_submit",
    targetType: "article_change_request",
    targetId: created.id,
    detail: JSON.stringify({ articleId: article.id }),
  });

  return NextResponse.json(created);
}
