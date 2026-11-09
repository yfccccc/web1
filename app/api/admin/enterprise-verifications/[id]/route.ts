import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { writeOperationLog } from "@/lib/operation-log";
import { reviewEnterpriseVerification, getVerificationConflict, verificationDetailSelect } from "@/lib/enterprise-verification-workflow";

export const dynamic = "force-dynamic";
function isAdmin(role: string | null | undefined) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "仅管理员可访问" }, { status: 403 });
  }
  const { id } = await params;
  const item = await prisma.enterpriseVerification.findUnique({ where: { id }, select: verificationDetailSelect });
  if (!item) return NextResponse.json({ error: "认证申请不存在" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "仅管理员可审核" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() : null;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action 仅支持 approve/reject" }, { status: 400 });
  }
  try {
    const result = await reviewEnterpriseVerification(prisma, { id, action, reviewNote, reviewerId: session.sub });
    await writeOperationLog({
      actorId: session.sub, actorEmail: session.email,
      action: action === "approve" ? "enterprise_verification_approve" : "enterprise_verification_reject",
      targetType: "enterprise_verification", targetId: id,
      detail: JSON.stringify({ enterpriseId: result.enterpriseId, reviewNote }),
    });
    return NextResponse.json(result);
  } catch (error) {
    const conflict = getVerificationConflict(error);
    if (conflict) {
      return NextResponse.json({ error: conflict.error }, { status: conflict.status });
    }
    throw error;
  }
}
