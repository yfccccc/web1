import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function isAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}

function parseInteger(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function parseBoolean(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return fallback;
}

function revalidateBuyingPaths() {
  revalidatePath("/brands");
  revalidatePath("/brands/buying");
  revalidatePath("/brands/faq");
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const total = await prisma.buyingFaq.count();
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const resolvedPage = Math.min(page, totalPages);
  const items = await prisma.buyingFaq.findMany({
    orderBy: [{ sort: "asc" }, { updatedAt: "desc" }],
    skip: (resolvedPage - 1) * limit,
    take: limit,
  });

  return NextResponse.json({ items, total, page: resolvedPage, limit, totalPages });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";

  if (!question) {
    return NextResponse.json({ error: "问题不能为空" }, { status: 400 });
  }
  if (!answer) {
    return NextResponse.json({ error: "答案不能为空" }, { status: 400 });
  }

  const item = await prisma.buyingFaq.create({
    data: {
      question,
      answer,
      sort: parseInteger(body.sort, 0),
      visible: parseBoolean(body.visible, true),
    },
  });

  revalidateBuyingPaths();
  return NextResponse.json(item);
}
