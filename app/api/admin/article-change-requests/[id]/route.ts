import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { applyArticlePatch } from "@/lib/article-change";
import { normalizeRichTextField } from "@/lib/brand-content";
import { canChangeReviewStatus } from "@/lib/content-permissions";
import { writeOperationLog } from "@/lib/operation-log";
import { findDuplicateArticleByTitle } from "@/lib/article-title";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !canChangeReviewStatus(session)) {
    return NextResponse.json({ error: "仅主管理员可审核修改申请" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status : "";
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() : null;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "状态仅支持 approved/rejected" }, { status: 400 });
  }

  const req = await prisma.articleChangeRequest.findUnique({
    where: { id },
    include: { article: true },
  });
  if (!req) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  if (req.status !== "pending") {
    return NextResponse.json({ error: "该申请已审核" }, { status: 400 });
  }

  if (status === "approved") {
    const patchData = applyArticlePatch(req.article, req);
    if (Object.keys(patchData).length > 0) {
      if (typeof patchData.content === "string") {
        patchData.content = normalizeRichTextField(patchData.content) ?? "";
      }
      if (typeof patchData.title === "string") {
        const existingTitle = await findDuplicateArticleByTitle(patchData.title, req.articleId);
        if (existingTitle) {
          return NextResponse.json({ error: "标题已存在，请更换一个新的标题" }, { status: 400 });
        }
      }
      if (typeof patchData.slug === "string") {
        const existing = await prisma.article.findFirst({
          where: { slug: patchData.slug, NOT: { id: req.articleId } },
          select: { id: true },
        });
        if (existing) return NextResponse.json({ error: "变更后的 slug 已存在" }, { status: 400 });
      }
      await prisma.article.update({ where: { id: req.articleId }, data: patchData });
    }
  }

  const updated = await prisma.articleChangeRequest.update({
    where: { id },
    data: {
      status,
      reviewNote,
      reviewedAt: new Date(),
      reviewedById: session.sub,
    },
  });

  await writeOperationLog({
    actorId: session.sub,
    actorEmail: session.email,
    action: "article_change_request_review",
    targetType: "article_change_request",
    targetId: id,
    detail: JSON.stringify({ status, articleId: req.articleId }),
  });

  return NextResponse.json(updated);
}
