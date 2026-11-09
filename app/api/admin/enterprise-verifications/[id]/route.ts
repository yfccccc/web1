import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { writeOperationLog } from "@/lib/operation-log";
import { normalizeRichTextField } from "@/lib/brand-content";

class ReviewConflict extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function isAdmin(role: string | null | undefined) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "仅管理员可审核" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() : null;

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action 仅支持 approve/reject" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.enterpriseVerification.findUnique({ where: { id } });
      if (!current) throw new ReviewConflict(404, "认证申请不存在");
      if (current.status !== "pending") throw new ReviewConflict(409, "该申请已处理");
      // Claim the exact pending revision before any enterprise/member side effects.
      // PostgreSQL rechecks this predicate after waiting for a concurrent writer.
      const reviewNoteValue = reviewNote || (action === "approve" ? "审核通过" : "资质信息不完整或不符合要求");
      const claimed = await tx.enterpriseVerification.updateMany({
        where: { id, status: "pending", updatedAt: current.updatedAt },
        data: { status: action === "approve" ? "approved" : "rejected",
          reviewNote: reviewNoteValue, reviewedAt: new Date(), reviewedById: session.sub },
      });
      if (claimed.count !== 1) throw new ReviewConflict(409, "申请已被处理或修改，请刷新后重试");
      if (action === "reject") {
        return { rejected: await tx.enterpriseVerification.findUniqueOrThrow({ where: { id } }), enterpriseId: null };
      }

      const enterprise = await tx.enterprise.upsert({
        where: { memberId: current.memberId },
        create: {
          memberId: current.memberId,
          companyName: current.companyName,
          companyShortName: current.companyShortName,
          contactPerson: current.contactPerson,
          contactPhone: current.contactPhone,
          contactInfo: current.contactEmail,
          website: current.website,
          address: current.address,
          licenseCode: current.licenseCode,
          foundedAt: current.foundedAt,
          registeredCapital: current.registeredCapital,
          intro: normalizeRichTextField(current.intro),
          logoUrl: current.logoUrl,
          productSystem: current.productSystem,
          positioning: current.coreAdvantages,
          certifications: current.businessScope,
          verificationStatus: "approved",
          verifiedAt: new Date(),
          sourceVerificationId: current.id,
        },
        update: {
          companyName: current.companyName,
          companyShortName: current.companyShortName,
          contactPerson: current.contactPerson,
          contactPhone: current.contactPhone,
          contactInfo: current.contactEmail,
          website: current.website,
          address: current.address,
          licenseCode: current.licenseCode,
          foundedAt: current.foundedAt,
          registeredCapital: current.registeredCapital,
          intro: normalizeRichTextField(current.intro),
          logoUrl: current.logoUrl,
          productSystem: current.productSystem,
          positioning: current.coreAdvantages,
          certifications: current.businessScope,
          verificationStatus: "approved",
          verifiedAt: new Date(),
          sourceVerificationId: current.id,
        },
        select: { id: true },
      });

      await tx.enterpriseVerification.update({
        where: { id }, data: { approvedEnterpriseId: enterprise.id },
      });

      const member = await tx.member.findUnique({
        where: { id: current.memberId },
        select: { memberType: true, name: true },
      });

      if (member) {
        const patch: { memberType?: string; name?: string } = {};
        if (member.memberType === "personal") patch.memberType = "enterprise_basic";
        if (!member.name || !member.name.trim()) patch.name = current.companyShortName || current.companyName;
        if (Object.keys(patch).length > 0) {
          await tx.member.update({ where: { id: current.memberId }, data: patch });
        }
      }

      return { rejected: null, enterpriseId: enterprise.id };
    }, { maxWait: 10000, timeout: 30000 });

    await writeOperationLog({
      actorId: session.sub, actorEmail: session.email,
      action: action === "approve" ? "enterprise_verification_approve" : "enterprise_verification_reject",
      targetType: "enterprise_verification", targetId: id,
      detail: JSON.stringify(result.rejected ? { reviewNote: result.rejected.reviewNote } : { enterpriseId: result.enterpriseId }),
    });
    return result.rejected ? NextResponse.json(result.rejected)
      : NextResponse.json({ ok: true, enterpriseId: result.enterpriseId });
  } catch (error) {
    if (error instanceof ReviewConflict) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
