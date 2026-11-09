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
    prisma.term.findMany({ orderBy: { updatedAt: "desc" }, skip, take: limit }),
    prisma.term.count(),
  ]);
  return NextResponse.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = await request.json();
  const { title, slug, definition, background, features, structure, significance, version } = body;
  if (!title || !slug || typeof title !== "string" || typeof slug !== "string") {
    return NextResponse.json({ error: "标题与 slug 必填" }, { status: 400 });
  }

  const slugTrim = slug.trim();
  if (!slugTrim) return NextResponse.json({ error: "slug 不能为空" }, { status: 400 });
  const existing = await prisma.term.findUnique({ where: { slug: slugTrim } });
  if (existing) return NextResponse.json({ error: "该 slug 已存在" }, { status: 400 });

  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);
  try {
    const term = await prisma.term.create({
      data: {
        title: title.trim(),
        slug: slugTrim,
        definition: typeof definition === "string" ? definition : "",
        background: str(background),
        features: str(features),
        structure: str(structure),
        significance: str(significance),
        version: str(version),
      },
    });
    return NextResponse.json(term);
  } catch (e) {
    console.error("POST /api/admin/terms", e);
    const msg =
      process.env.NODE_ENV === "development" && e instanceof Error ? e.message : "发布失败，请稍后重试";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
