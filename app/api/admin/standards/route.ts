import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { normalizeRichTextField } from "@/lib/brand-content";

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
    prisma.standard.findMany({ orderBy: { updatedAt: "desc" }, skip, take: limit }),
    prisma.standard.count(),
  ]);
  return NextResponse.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = await request.json();
  const { title, code, year, content, version } = body;
  if (!title || !code || typeof title !== "string" || typeof code !== "string") {
    return NextResponse.json({ error: "标题与标准编号必填" }, { status: 400 });
  }

  const y = typeof year === "number" ? year : parseInt(String(year), 10);
  if (Number.isNaN(y)) return NextResponse.json({ error: "年份需为数字" }, { status: 400 });

  try {
    const standard = await prisma.standard.create({
      data: {
        title: title.trim(),
        code: code.trim(),
        year: y,
        content: normalizeRichTextField(content),
        version: typeof version === "string" ? version.trim() || null : null,
      },
    });
    return NextResponse.json(standard);
  } catch (e) {
    console.error("POST /api/admin/standards", e);
    const msg =
      process.env.NODE_ENV === "development" && e instanceof Error ? e.message : "发布失败，请稍后重试";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
