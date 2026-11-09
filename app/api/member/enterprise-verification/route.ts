import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { writeOperationLog } from "@/lib/operation-log";
import { normalizeRichTextField } from "@/lib/brand-content";
import {
  getEnterpriseVerificationFormatError,
  normalizeEnterpriseAddress,
  normalizeEnterprisePhone,
  normalizeUnifiedSocialCreditCode,
} from "@/lib/enterprise-verification-validation";

import { submitEnterpriseVerification, getVerificationConflict, ALREADY_VERIFIED } from "@/lib/enterprise-verification-workflow";

const REMOVED_SENSITIVE_FIELD_PLACEHOLDER = "[removed]";

function trimRequired(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function trimOptional(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function normalizeAttachments(input: unknown) {
  if (!Array.isArray(input)) return null;
  const items = input
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
  return items.length > 0 ? JSON.stringify(items) : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const [latest, enterprise] = await Promise.all([
    prisma.enterpriseVerification.findFirst({
      where: { memberId: session.sub },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyName: true,
        companyShortName: true,
        accountName: true,
        contactPerson: true,
        contactPhone: true,
        contactEmail: true,
        logoUrl: true,
        licenseImageUrl: true,
        licenseCode: true,
        address: true,
        foundedAt: true,
        registeredCapital: true,
        website: true,
        intro: true,
        businessScope: true,
        productSystem: true,
        coreAdvantages: true,
        attachmentsJson: true,
        status: true,
        reviewNote: true,
        updatedAt: true,
      },
    }),
    prisma.enterprise.findUnique({
      where: { memberId: session.sub },
      select: {
        id: true,
        companyName: true,
        companyShortName: true,
        verificationStatus: true,
        verifiedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    latest: latest ? { ...latest, accountPassword: "" } : null,
    enterprise,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const existingEnterprise = await prisma.enterprise.findUnique({
    where: { memberId: session.sub }, select: { verificationStatus: true },
  });
  if (existingEnterprise?.verificationStatus === "approved") {
    return NextResponse.json({ error: ALREADY_VERIFIED }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));

  let payload: {
    companyName: string;
    companyShortName: string | null;
    accountName: string;
    accountPassword: string;
    contactPerson: string;
    contactPhone: string;
    contactEmail: string | null;
    logoUrl: string | null;
    licenseImageUrl: string;
    licenseCode: string;
    address: string;
    foundedAt: string | null;
    registeredCapital: string | null;
    website: string | null;
    intro: string | null;
    businessScope: string | null;
    productSystem: string | null;
    coreAdvantages: string | null;
    attachmentsJson: string | null;
  };

  try {
    payload = {
      companyName: trimRequired(body.companyName, "企业全称"),
      companyShortName: trimOptional(body.companyShortName),
      accountName: trimRequired(body.accountName, "企业账号"),
      accountPassword: REMOVED_SENSITIVE_FIELD_PLACEHOLDER,
      contactPerson: trimRequired(body.contactPerson, "联系人"),
      contactPhone: normalizeEnterprisePhone(trimRequired(body.contactPhone, "联系电话")),
      contactEmail: trimOptional(body.contactEmail),
      logoUrl: trimOptional(body.logoUrl),
      licenseImageUrl: trimRequired(body.licenseImageUrl, "营业执照图片"),
      licenseCode: normalizeUnifiedSocialCreditCode(trimRequired(body.licenseCode, "统一社会信用代码")),
      address: normalizeEnterpriseAddress(trimRequired(body.address, "企业地址")),
      foundedAt: trimOptional(body.foundedAt),
      registeredCapital: trimOptional(body.registeredCapital),
      website: trimOptional(body.website),
      intro: normalizeRichTextField(body.intro),
      businessScope: trimOptional(body.businessScope),
      productSystem: trimOptional(body.productSystem),
      coreAdvantages: trimOptional(body.coreAdvantages),
      attachmentsJson: normalizeAttachments(body.attachments),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "参数错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const formatError = getEnterpriseVerificationFormatError(payload);
  if (formatError) {
    return NextResponse.json({ error: formatError }, { status: 400 });
  }

  let saved;
  try {
    saved = await submitEnterpriseVerification(prisma, session.sub, payload);
  } catch (error) {
    const conflict = getVerificationConflict(error);
    if (conflict) {
      return NextResponse.json({ error: conflict.error }, { status: conflict.status });
    }
    throw error;
  }

  await writeOperationLog({
    actorId: session.sub,
    actorEmail: session.email,
    action: "enterprise_verification_submit",
    targetType: "enterprise_verification",
    targetId: saved.id,
    detail: JSON.stringify({ status: saved.status }),
  });

  return NextResponse.json(saved);
}
