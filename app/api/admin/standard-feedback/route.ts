import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function isAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const requestedPage = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const where = status && ["draft", "pending", "approved", "rejected"].includes(status) ? { status } : {};
  const total = await prisma.standardFeedback.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);

  const items = await prisma.standardFeedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      member: { select: { id: true, email: true, name: true, memberType: true } },
      standard: { select: { id: true, title: true, code: true } },
    },
    skip: (page - 1) * limit,
    take: limit,
  });

  return NextResponse.json({ items, total, page, limit, totalPages });
}
