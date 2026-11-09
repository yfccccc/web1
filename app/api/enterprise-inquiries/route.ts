import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeOperationLog } from "@/lib/operation-log";
import { validateEnterpriseInquiry } from "@/lib/enterprise-inquiry-validation";
import { checkEnterpriseInquiryRateLimits } from "@/lib/enterprise-inquiry-rate-limit";
import { createRateLimitResponse } from "@/lib/rate-limit";
import { safeErrorSummary } from "@/lib/log-safety";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const validation = validateEnterpriseInquiry(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  if (validation.honeypot) {
    return NextResponse.json({ ok: true, message: "需求已提交。" });
  }

  const { enterpriseId, visitorName, phone, demand, city, wechat, company, sourcePage } = validation.value;
  const rateLimit = checkEnterpriseInquiryRateLimits({ request, value: validation.value, honeypot: false });
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfterSec);

  try {
    const enterprise = await prisma.enterprise.findUnique({
      where: { id: enterpriseId },
      select: { id: true, companyName: true, companyShortName: true },
    });
    if (!enterprise) return NextResponse.json({ error: "未找到对应企业。" }, { status: 404 });

    const inquiry = await prisma.enterpriseInquiry.create({
      data: {
        enterpriseId: enterprise.id,
        visitorName,
        phone,
        city: city || null,
        wechat: wechat || null,
        company: company || null,
        demand,
        sourcePage: sourcePage || null,
      },
    });

    await writeOperationLog({
      action: "enterprise_inquiry_submit",
      targetType: "enterprise_inquiry",
      targetId: inquiry.id,
      detail: JSON.stringify({
        enterpriseId: enterprise.id,
        enterpriseName: enterprise.companyShortName || enterprise.companyName || enterprise.id,
      }),
    });

    return NextResponse.json({
      ok: true,
      inquiryId: inquiry.id,
      message: "需求已提交，企业会尽快查看并与你联系。",
    });
  } catch (error) {
    console.error("POST /api/enterprise-inquiries", safeErrorSummary(error));
    return NextResponse.json({ error: "提交失败，请稍后重试。" }, { status: 500 });
  }
}
