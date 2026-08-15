import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { defaultContentStatusForSubmission } from "@/lib/member-access";
import { writeOperationLog } from "@/lib/operation-log";
import { isContentReviewRequired } from "@/lib/app-settings";
import { normalizeGalleryCategory } from "@/lib/gallery-taxonomy";
import { getEffectiveMemberAccessForMember } from "@/lib/member-access-resolver";
import {
  ENTERPRISE_BASIC_GALLERY_LIMIT,
  getCalendarYearRange,
  isAnnualLimitReached,
} from "@/lib/enterprise-basic-limits";

const TITLE_MAX = 24;
const ALT_MAX = 100;
const TAGS_MAX = 80;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.galleryImage.findMany({
      where: { authorMemberId: session.sub },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.galleryImage.count({ where: { authorMemberId: session.sub } }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const memberAccess = await getEffectiveMemberAccessForMember(session.sub, session.memberType);
  const membershipRule = memberAccess.membershipRule;

  if (!memberAccess.features.galleryUpload) {
    return NextResponse.json({ error: `${membershipRule.label}当前不支持企业图库上传` }, { status: 403 });
  }

  const galleryLimit =
    session.memberType === "enterprise_basic" ? ENTERPRISE_BASIC_GALLERY_LIMIT : membershipRule.galleryUploadLimit;
  if (galleryLimit != null) {
    const where =
      session.memberType === "enterprise_basic"
        ? (() => {
            const { start, end } = getCalendarYearRange();
            return { authorMemberId: session.sub, createdAt: { gte: start, lt: end } };
          })()
        : { authorMemberId: session.sub };
    const count = await prisma.galleryImage.count({ where });
    if (isAnnualLimitReached(count, galleryLimit)) {
      return NextResponse.json(
        { error: `${membershipRule.label}本年度图库上传额度已用完（${galleryLimit}张）` },
        { status: 400 }
      );
    }
  }

  const reviewRequired = await isContentReviewRequired();
  const submissionStatus = defaultContentStatusForSubmission({
    reviewRequired,
    role: session.role,
    canPublishWithoutReview: session.canPublishWithoutReview,
  });

  const body = await request.json().catch(() => ({}));
  const { title, imageUrl, alt, category, sortOrder, tagSlugs, syncToMainSite } = body;
  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json({ error: "图片地址必填" }, { status: 400 });
  }
  const url = imageUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "图片地址需为 http/https 链接" }, { status: 400 });
  }

  const safeTitle = typeof title === "string" ? title.trim() : "";
  const safeAlt = typeof alt === "string" ? alt.trim() : "";
  const safeTags = typeof tagSlugs === "string" ? tagSlugs.trim() : "";
  const safeCategory = normalizeGalleryCategory(typeof category === "string" ? category : null);

  if (safeTitle.length > TITLE_MAX) {
    return NextResponse.json({ error: `标题请控制在 ${TITLE_MAX} 字以内` }, { status: 400 });
  }
  if (safeAlt.length > ALT_MAX) {
    return NextResponse.json({ error: `图片说明请控制在 ${ALT_MAX} 字以内` }, { status: 400 });
  }
  if (safeTags.length > TAGS_MAX) {
    return NextResponse.json({ error: `标签请控制在 ${TAGS_MAX} 字以内` }, { status: 400 });
  }

  const order = typeof sortOrder === "number" ? sortOrder : parseInt(String(sortOrder || 0), 10);

  const image = await prisma.galleryImage.create({
    data: {
      title: safeTitle || null,
      imageUrl: url,
      alt: safeAlt || null,
      category: safeCategory,
      sortOrder: Number.isNaN(order) ? 0 : order,
      tagSlugs: safeTags || null,
      syncToMainSite: syncToMainSite === true,
      status: submissionStatus,
      authorMemberId: session.sub,
    },
  });

  await writeOperationLog({
    actorId: session.sub,
    actorEmail: session.email,
    action: "member_gallery_submit",
    targetType: "gallery_image",
    targetId: image.id,
    detail: JSON.stringify({ status: image.status, memberType: session.memberType }),
  });

  return NextResponse.json(image);
}
