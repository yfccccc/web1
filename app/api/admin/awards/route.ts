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
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.award.findMany({ orderBy: { updatedAt: "desc" }, skip, take: limit }),
    prisma.award.count(),
  ]);
  return NextResponse.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = await request.json();
  const { title, slug, year, description, coverImage, linkUrl } = body;
  if (!title || !slug || typeof title !== "string" || typeof slug !== "string") {
    return NextResponse.json({ error: "标题与 slug 必填" }, { status: 400 });
  }

  const slugTrim = slug.trim();
  if (!slugTrim) return NextResponse.json({ error: "slug 不能为空" }, { status: 400 });
  const existing = await prisma.award.findUnique({ where: { slug: slugTrim } });
  if (existing) return NextResponse.json({ error: "该 slug 已存在" }, { status: 400 });

  const y = typeof year === "number" ? year : year != null ? parseInt(String(year), 10) : null;
  try {
    const award = await prisma.award.create({
      data: {
        title: title.trim(),
        slug: slugTrim,
        year: y != null && !Number.isNaN(y) ? y : null,
        description: typeof description === "string" ? description.trim() || null : null,
        coverImage: typeof coverImage === "string" ? coverImage.trim() || null : null,
        linkUrl: typeof linkUrl === "string" ? linkUrl.trim() || null : null,
      },
    });
    return NextResponse.json(award);
  } catch (e) {
    console.error("POST /api/admin/awards", e);
    const msg =
      process.env.NODE_ENV === "development" && e instanceof Error ? e.message : "发布失败，请稍后重试";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
