import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function isAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const region = searchParams.get("region")?.trim() ?? "";
  const brandBinding = searchParams.get("brandBinding")?.trim() ?? "";
  const verificationStatus = searchParams.get("verificationStatus")?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const skip = (page - 1) * limit;

  const conditions: Record<string, unknown>[] = [];

  if (q) {
    conditions.push({
      OR: [
        { companyName: { contains: q } },
        { companyShortName: { contains: q } },
        { productSystem: { contains: q } },
        { region: { contains: q } },
        { area: { contains: q } },
        { member: { name: { contains: q } } },
        { member: { email: { contains: q } } },
      ],
    });
  }

  if (region) {
    conditions.push({
      OR: [{ region: { contains: region } }, { area: { contains: region } }],
    });
  }

  if (verificationStatus) {
    conditions.push({ verificationStatus });
  }

  if (brandBinding === "bound") {
    conditions.push({ brand: { isNot: null } });
  } else if (brandBinding === "unbound") {
    conditions.push({ brand: null });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  const [items, total] = await Promise.all([
    prisma.enterprise.findMany({
      where,
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            memberType: true,
            rankingWeight: true,
          },
        },
        brand: {
          select: {
            id: true,
            name: true,
            slug: true,
            isBrandVisible: true,
            isRecommend: true,
            sortOrder: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.enterprise.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}
