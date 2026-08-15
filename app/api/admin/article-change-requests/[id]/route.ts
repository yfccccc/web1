import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { applyArticlePatch } from "@/lib/article-change";
import { normalizeRichTextField } from "@/lib/brand-content";
import { canChangeReviewStatus } from "@/lib/content-permissions";
import { writeOperationLog } from "@/lib/operation-log";

export const dynamic = "force-dynamic";

class ReviewValidationError extends Error {}

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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const changeRequest = await tx.articleChangeRequest.findUnique({
        where: { id },
        include: { article: true },
      });
      if (!changeRequest) return { kind: "missing" as const };

      const claimed = await tx.articleChangeRequest.updateMany({
        where: { id, status: "pending" },
        data: {
          status,
          reviewNote,
          reviewedAt: new Date(),
          reviewedById: session.sub,
        },
      });
      if (claimed.count !== 1) return { kind: "processed" as const };

      if (status === "approved") {
        const patchData = applyArticlePatch(changeRequest.article, changeRequest);
        if (Object.keys(patchData).length > 0) {
          if (typeof patchData.content === "string") {
            patchData.content = normalizeRichTextField(patchData.content) ?? "";
          }
          if (typeof patchData.title === "string") {
            const existingTitle = await tx.article.findFirst({
              where: {
                title: { equals: patchData.title, mode: "insensitive" },
                NOT: { id: changeRequest.articleId },
              },
              select: { id: true },
            });
            if (existingTitle) throw new ReviewValidationError("标题已存在，请更换一个新的标题");
          }
          if (typeof patchData.slug === "string") {
            const existingSlug = await tx.article.findFirst({
              where: { slug: patchData.slug, NOT: { id: changeRequest.articleId } },
              select: { id: true },
            });
            if (existingSlug) throw new ReviewValidationError("变更后的 slug 已存在");
          }
          await tx.article.update({ where: { id: changeRequest.articleId }, data: patchData });
        }
      }

      const updated = await tx.articleChangeRequest.findUnique({ where: { id } });
      return { kind: "updated" as const, updated, articleId: changeRequest.articleId };
    });

    if (result.kind === "missing") return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    if (result.kind === "processed") {
      return NextResponse.json({ error: "该申请已审核" }, { status: 409 });
    }

    await writeOperationLog({
      actorId: session.sub,
      actorEmail: session.email,
      action: "article_change_request_review",
      targetType: "article_change_request",
      targetId: id,
      detail: JSON.stringify({ status, articleId: result.articleId }),
    });

    return NextResponse.json(result.updated);
  } catch (error) {
    if (error instanceof ReviewValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
