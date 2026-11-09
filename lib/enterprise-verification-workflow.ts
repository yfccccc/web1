import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeRichTextField } from "./brand-content";
import { normalizeUnifiedSocialCreditCode } from "./enterprise-verification-validation";

export class VerificationConflict extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export const ALREADY_VERIFIED = "您已成功完成企业认证，无需重复提交";
export const DUPLICATE_LICENSE = "该统一社会信用代码已被注册，请勿重复提交";

export function getVerificationConflict(error: unknown): { error: string; status: number } | null {
  if (error instanceof VerificationConflict) return { error: error.message, status: error.status };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { error: DUPLICATE_LICENSE, status: 409 };
  }
  return null;
}

async function lockMember(tx: Prisma.TransactionClient, memberId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM members WHERE id = ${memberId} FOR UPDATE`;
  if (!rows.length) throw new VerificationConflict("账号不存在", 404);
}

async function assertLicenseAvailable(tx: Prisma.TransactionClient, memberId: string, code: string) {
  // All submission/approval writers lock the member first, then this normalized code.
  // The code lock prevents concurrent claims; the unique index is the final safeguard.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${code}, 0))::text`;
  const occupied = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM enterprises
    WHERE "memberId" <> ${memberId}
      AND upper(regexp_replace("licenseCode", '\\s+', '', 'g')) = ${code}
    UNION ALL
    SELECT id FROM enterprise_verifications
    WHERE "memberId" <> ${memberId} AND status = 'pending'
      AND upper(regexp_replace("licenseCode", '\\s+', '', 'g')) = ${code}
    LIMIT 1`;
  if (occupied.length) throw new VerificationConflict(DUPLICATE_LICENSE);
}

async function assertNotApproved(tx: Prisma.TransactionClient, memberId: string) {
  const enterprise = await tx.enterprise.findUnique({ where: { memberId }, select: { verificationStatus: true } });
  if (enterprise?.verificationStatus === "approved") throw new VerificationConflict(ALREADY_VERIFIED);
}

type Submission = Omit<Prisma.EnterpriseVerificationUncheckedCreateInput,
  "id" | "memberId" | "status" | "reviewNote" | "reviewedAt" | "reviewedById" | "approvedEnterpriseId" | "createdAt" | "updatedAt">;

export async function submitEnterpriseVerification(db: PrismaClient, memberId: string, payload: Submission) {
  return db.$transaction(async (tx) => {
    await lockMember(tx, memberId);
    await assertNotApproved(tx, memberId);
    const licenseCode = normalizeUnifiedSocialCreditCode(payload.licenseCode);
    await assertLicenseAvailable(tx, memberId, licenseCode);
    const existing = await tx.enterpriseVerification.findFirst({
      where: { memberId, status: "pending" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true },
    });
    const data = { ...payload, licenseCode };
    return existing
      ? tx.enterpriseVerification.update({ where: { id: existing.id }, data: {
          ...data, status: "pending", reviewNote: null, reviewedAt: null, reviewedById: null,
        } })
      : tx.enterpriseVerification.create({ data: { ...data, memberId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
}

export async function reviewEnterpriseVerification(db: PrismaClient, input: {
  id: string; action: "approve" | "reject"; reviewNote: string | null; reviewerId: string;
}) {
  return db.$transaction(async (tx) => {
    const owner = await tx.enterpriseVerification.findUnique({ where: { id: input.id }, select: { memberId: true } });
    if (!owner) throw new VerificationConflict("认证申请不存在", 404);
    await lockMember(tx, owner.memberId);
    // Re-read after waiting for concurrent submission/review to finish.
    const current = await tx.enterpriseVerification.findUnique({ where: { id: input.id } });
    if (!current) throw new VerificationConflict("认证申请不存在", 404);
    if (current.status !== "pending") throw new VerificationConflict("该申请已处理");
    const now = new Date();
    if (input.action === "reject") {
      await tx.enterpriseVerification.update({ where: { id: current.id }, data: {
        status: "rejected", reviewNote: input.reviewNote || "资质信息不完整或不符合要求",
        reviewedAt: now, reviewedById: input.reviewerId,
      } });
      return { ok: true, enterpriseId: null };
    }
    await assertNotApproved(tx, current.memberId);
    const licenseCode = normalizeUnifiedSocialCreditCode(current.licenseCode);
    await assertLicenseAvailable(tx, current.memberId, licenseCode);
    const data = {
      companyName: current.companyName, companyShortName: current.companyShortName,
      contactPerson: current.contactPerson, contactPhone: current.contactPhone,
      contactInfo: current.contactEmail, website: current.website, address: current.address,
      licenseCode, foundedAt: current.foundedAt, registeredCapital: current.registeredCapital,
      intro: normalizeRichTextField(current.intro), logoUrl: current.logoUrl,
      productSystem: current.productSystem, positioning: current.coreAdvantages,
      certifications: current.businessScope, verificationStatus: "approved",
      verifiedAt: now, sourceVerificationId: current.id,
    };
    const enterprise = await tx.enterprise.upsert({
      where: { memberId: current.memberId }, create: { memberId: current.memberId, ...data },
      update: data, select: { id: true },
    });
    await tx.enterpriseVerification.update({ where: { id: current.id }, data: {
      status: "approved", reviewNote: input.reviewNote || "审核通过", reviewedAt: now,
      reviewedById: input.reviewerId, approvedEnterpriseId: enterprise.id,
    } });
    const member = await tx.member.findUniqueOrThrow({ where: { id: current.memberId }, select: { memberType: true, name: true } });
    await tx.member.update({ where: { id: current.memberId }, data: {
      accountStatus: "active", reviewedAt: now, reviewedById: input.reviewerId,
      ...(member.memberType === "personal" ? { memberType: "enterprise_basic" } : {}),
      ...(!member.name?.trim() ? { name: current.companyShortName || current.companyName } : {}),
    } });
    return { ok: true, enterpriseId: enterprise.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
}

// Explicit safe projection: never expose application passwords or member credentials.
export const verificationDetailSelect = {
  id: true, companyName: true, companyShortName: true, contactPerson: true,
  contactPhone: true, contactEmail: true, logoUrl: true, licenseImageUrl: true,
  licenseCode: true, address: true, website: true, intro: true, businessScope: true,
  productSystem: true, coreAdvantages: true, status: true, reviewNote: true,
  reviewedAt: true, createdAt: true, updatedAt: true, approvedEnterpriseId: true,
  member: { select: { id: true, email: true, memberType: true } },
} satisfies Prisma.EnterpriseVerificationSelect;
