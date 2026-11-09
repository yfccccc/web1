import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { defaultContentStatusForSubmission } from "@/lib/member-access";
import { isContentReviewRequired } from "@/lib/app-settings";

function isAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}

function isSuperAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN";
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

  const status = searchParams.get("status");
  const where = status && ["draft", "pending", "approved", "rejected"].includes(status) ? { status } : {};

  const [items, total] = await Promise.all([
    prisma.galleryImage.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.galleryImage.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = await request.json();
  const { title, imageUrl, alt, category, sortOrder, status, reviewNote, tagSlugs, syncToMainSite } = body;
  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json({ error: "图片地址必填" }, { status: 400 });
  }

  const order = typeof sortOrder === "number" ? sortOrder : parseInt(String(sortOrder || 0), 10);
  const reviewRequired = await isContentReviewRequired();
  const safeStatus =
    isSuperAdmin(session) && typeof status === "string" && ["draft", "pending", "approved", "rejected"].includes(status)
      ? status
      : defaultContentStatusForSubmission({
          reviewRequired,
          role: session.role,
          canPublishWithoutReview: session.canPublishWithoutReview,
        });

  try {
    const img = await prisma.galleryImage.create({
      data: {
        title: typeof title === "string" ? title.trim() || null : null,
        imageUrl: imageUrl.trim(),
        alt: typeof alt === "string" ? alt.trim() || null : null,
        category: typeof category === "string" ? category.trim() || null : null,
        sortOrder: Number.isNaN(order) ? 0 : order,
        status: safeStatus,
        reviewNote: typeof reviewNote === "string" ? reviewNote.trim() || null : null,
        reviewedAt: safeStatus === "approved" || safeStatus === "rejected" ? new Date() : null,
        reviewedById: safeStatus === "approved" || safeStatus === "rejected" ? session.sub : null,
        tagSlugs: typeof tagSlugs === "string" ? tagSlugs.trim() || null : null,
        syncToMainSite: syncToMainSite === true,
      },
    });
    return NextResponse.json(img);
  } catch (e) {
    console.error("POST /api/admin/gallery", e);
    const msg = process.env.NODE_ENV === "development" && e instanceof Error ? e.message : "发布失败，请稍后重试";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
