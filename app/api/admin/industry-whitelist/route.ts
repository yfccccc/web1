import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function isAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category")?.trim();
  const weight = Number(searchParams.get("weight") || 0);
  const q = searchParams.get("q")?.trim();
  const requestedPage = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (weight >= 1 && weight <= 3) where.weight = weight;
  if (q) {
    where.OR = [
      { word: { contains: q, mode: "insensitive" } },
      { synonyms: { contains: q, mode: "insensitive" } },
    ];
  }

  const total = await prisma.industryWhitelist.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);
  const items = await prisma.industryWhitelist.findMany({
    where,
    orderBy: [{ weight: "desc" }, { word: "asc" }],
    skip: (page - 1) * limit,
    take: limit,
  });

  return NextResponse.json({ items, total, page, limit, totalPages });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const word = typeof body.word === "string" ? body.word.trim() : "";
  if (!word) {
    return NextResponse.json({ error: "关键词不能为空" }, { status: 400 });
  }

  const synonyms =
    Array.isArray(body.synonyms)
      ? body.synonyms.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [];

  const item = await prisma.industryWhitelist.upsert({
    where: { word },
    update: {
      category: typeof body.category === "string" ? body.category.trim() || "品牌" : "品牌",
      subCategory: typeof body.subCategory === "string" ? body.subCategory.trim() || null : null,
      weight: Math.max(1, Math.min(3, Number(body.weight) || 1)),
      synonyms: synonyms.length > 0 ? JSON.stringify(synonyms) : null,
      status: body.status !== false,
    },
    create: {
      word,
      category: typeof body.category === "string" ? body.category.trim() || "品牌" : "品牌",
      subCategory: typeof body.subCategory === "string" ? body.subCategory.trim() || null : null,
      weight: Math.max(1, Math.min(3, Number(body.weight) || 1)),
      synonyms: synonyms.length > 0 ? JSON.stringify(synonyms) : null,
      status: body.status !== false,
    },
  });

  return NextResponse.json(item);
}
