import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, requireAdminOrSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!requireAdminOrSuper(session)) {
    return NextResponse.json({ error: "仅管理员可访问。" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim();
  const q = searchParams.get("q")?.trim();
  const requestedPage = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const where = {
    ...(status && ["pending", "processing", "sent", "resolved", "rejected"].includes(status)
      ? { status }
      : {}),
    ...(q
      ? {
          OR: [
            { account: { contains: q, mode: "insensitive" as const } },
            { requestNote: { contains: q, mode: "insensitive" as const } },
            { contactInfo: { contains: q, mode: "insensitive" as const } },
            { member: { name: { contains: q, mode: "insensitive" as const } } },
            { member: { enterprise: { companyName: { contains: q, mode: "insensitive" as const } } } },
            { member: { enterprise: { companyShortName: { contains: q, mode: "insensitive" as const } } } },
            { member: { enterprise: { brand: { name: { contains: q, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };
  const total = await prisma.passwordRecoveryRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);

  const items = await prisma.passwordRecoveryRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      member: {
        select: {
          id: true,
          email: true,
          name: true,
          recoveryEmail: true,
          role: true,
          memberType: true,
          enterprise: {
            select: {
              id: true,
              companyName: true,
              companyShortName: true,
              brand: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
      handledBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    skip: (page - 1) * limit,
    take: limit,
  });

  return NextResponse.json({ items, total, page, limit, totalPages });
}
