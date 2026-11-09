import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function isAdmin(role: string | null | undefined) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "仅管理员可访问" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

  const where = status && ["pending", "approved", "rejected"].includes(status) ? { status } : undefined;
  const total = await prisma.enterpriseVerification.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const resolvedPage = Math.min(page, totalPages);

  const items = await prisma.enterpriseVerification.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    skip: (resolvedPage - 1) * limit,
    take: limit,
    select: {
      id: true,
      companyName: true,
      companyShortName: true,
      contactPerson: true,
      contactPhone: true,
      contactEmail: true,
      logoUrl: true,
      licenseImageUrl: true,
      licenseCode: true,
      address: true,
      website: true,
      intro: true,
      businessScope: true,
      productSystem: true,
      coreAdvantages: true,
      status: true,
      approvedEnterpriseId: true,
      member: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          memberType: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({ items, total, page: resolvedPage, limit, totalPages });
}
