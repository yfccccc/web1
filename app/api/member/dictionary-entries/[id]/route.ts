import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildArticleDiffSummary, buildArticlePatchData } from "@/lib/article-change";
import { writeOperationLog } from "@/lib/operation-log";
import { normalizeRichTextField } from "@/lib/brand-content";
import { findDuplicateArticleByTitle, normalizeArticleTitle } from "@/lib/article-title";

function canDirectlyEdit(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, authorMemberId: string | null) {
  if (session.role === "SUPER_ADMIN") return true;
  if (session.canEditAllContent) return true;
  if (authorMemberId && authorMemberId === session.sub) return session.canEditOwnContent || session.canEditMemberContent;
  return session.canEditMemberContent;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const article = await prisma.article.findFirst({
    where: {
      id,
      status: "approved",
      OR: [{ categoryHref: { startsWith: "/dictionary" } }, { subHref: { startsWith: "/dictionary" } }],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      categoryHref: true,
      subHref: true,
      tagSlugs: true,
      authorMemberId: true,
      updatedAt: true,
    },
  });
  if (!article) return NextResponse.json({ error: "词条不存在" }, { status: 404 });

  return NextResponse.json({
    article,
    canDirectEdit: canDirectlyEdit(session, article.authorMemberId),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const article = await prisma.article.findFirst({
    where: {
      id,
      status: "approved",
      OR: [{ categoryHref: { startsWith: "/dictionary" } }, { subHref: { startsWith: "/dictionary" } }],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      coverImage: true,
      subHref: true,
      categoryHref: true,
      tagSlugs: true,
      authorMemberId: true,
    },
  });
  if (!article) return NextResponse.json({ error: "词条不存在" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? normalizeArticleTitle(body.title) : "";
  const excerpt = typeof body.excerpt === "string" ? body.excerpt : article.excerpt ?? "";
  const content = normalizeRichTextField(body.content) ?? "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!title || !content.trim()) {
    return NextResponse.json({ error: "标题和正文不能为空" }, { status: 400 });
  }
  const existingTitle = await findDuplicateArticleByTitle(title, article.id);
  if (existingTitle) {
    return NextResponse.json({ error: "标题已存在，请更换一个新的标题" }, { status: 400 });
  }
  const direct = canDirectlyEdit(session, article.authorMemberId);
  if (direct) {
    const updated = await prisma.article.update({
      where: { id: article.id },
      data: {
        title,
        excerpt: excerpt.trim() || null,
        content,
      },
      select: { id: true, slug: true, updatedAt: true },
    });

    await writeOperationLog({
      actorId: session.sub,
      actorEmail: session.email,
      action: "dictionary_entry_direct_edit",
      targetType: "article",
      targetId: article.id,
      detail: JSON.stringify({ mode: "direct" }),
    });

    return NextResponse.json({ mode: "direct", article: updated });
  }

  const patch = buildArticlePatchData({
    title,
    excerpt,
    content,
    subHref: article.subHref,
    categoryHref: article.categoryHref,
    tagSlugs: article.tagSlugs,
  });
  const diffSummary = buildArticleDiffSummary(article, patch);
  const hasPatch = Object.values(patch).some((v) => v !== null && String(v).trim() !== "");
  if (!hasPatch) {
    return NextResponse.json({ error: "未检测到修改内容" }, { status: 400 });
  }

  const created = await prisma.articleChangeRequest.create({
    data: {
      articleId: article.id,
      submitterId: session.sub,
      reason: reason || "词条内容修正",
      ...patch,
      diffSummary: diffSummary || null,
      status: "pending",
    },
    select: { id: true, status: true, createdAt: true },
  });

  await writeOperationLog({
    actorId: session.sub,
    actorEmail: session.email,
    action: "dictionary_entry_change_request_submit",
    targetType: "article_change_request",
    targetId: created.id,
    detail: JSON.stringify({ articleId: article.id }),
  });

  return NextResponse.json({ mode: "request", request: created });
}
