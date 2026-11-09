import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { normalizeRecoveryEmail } from "@/lib/password-recovery";
import { prisma } from "@/lib/prisma";
import { writeOperationLog } from "@/lib/operation-log";
import { mergeEffectivePermissionFlags, resolvePermissionFlags } from "@/lib/member-permissions";

export const dynamic = "force-dynamic";

function isAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}

function isSuperAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN";
}

function serializeMember(
  member: {
    id: string;
    email: string;
    recoveryEmail?: string | null;
    name: string | null;
    role: string | null;
    memberType: string;
    phone: string | null;
    phoneVerified: boolean;
    accountStatus: string;
    realName: string | null;
    identityDocumentType: string | null;
    identityDocumentNumber: string | null;
    identityDocumentFrontPath: string | null;
    identityDocumentBackPath: string | null;
    memberTypeExpiresAt?: Date | null;
    rankingWeight?: number;
    canPublishWithoutReview: boolean;
    canManageMembers: boolean;
    canDeleteOwnContent: boolean;
    canDeleteMemberContent: boolean;
    canDeleteAllContent: boolean;
    canEditOwnContent: boolean;
    canEditMemberContent: boolean;
    canEditAllContent: boolean;
    registeredAt: Date | null;
    reviewedAt: Date | null;
    createdAt: Date;
    _count: { articles: number };
    enterprise?: {
      id: string;
      companyName: string | null;
      companyShortName: string | null;
      brand: { id: string; name: string; slug: string } | null;
    } | null;
  }
) {
  const {
    phone,
    identityDocumentNumber,
    identityDocumentFrontPath,
    identityDocumentBackPath,
    _count,
    ...safeMember
  } = member;
  const merged = mergeEffectivePermissionFlags(safeMember);
  return {
    ...merged,
    account: member.email,
    phoneMasked: phone ? phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : null,
    identityDocumentNumberMasked: identityDocumentNumber
      ? identityDocumentNumber.replace(/^(.{3}).+(.{4})$/, "$1***********$2")
      : null,
    identityDocumentsUploaded: Boolean(identityDocumentFrontPath && identityDocumentBackPath),
    articleCount: _count.articles,
    recoveryEmail: member.recoveryEmail ?? null,
    registeredAt: member.registeredAt ? member.registeredAt.toISOString() : null,
    enterprise: member.enterprise ?? null,
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const requestedPage = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const where = q
    ? {
        OR: [
          { email: { contains: q } },
          { recoveryEmail: { contains: q } },
          { name: { contains: q } },
          { enterprise: { companyName: { contains: q } } },
          { enterprise: { companyShortName: { contains: q } } },
          { enterprise: { brand: { name: { contains: q } } } },
        ],
      }
    : undefined;
  const total = await prisma.member.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);

  const members = await prisma.member.findMany({
    where,
    select: {
      id: true,
      email: true,
      recoveryEmail: true,
      name: true,
      role: true,
      memberType: true,
      phone: true,
      phoneVerified: true,
      accountStatus: true,
      realName: true,
      identityDocumentType: true,
      identityDocumentNumber: true,
      identityDocumentFrontPath: true,
      identityDocumentBackPath: true,
      memberTypeExpiresAt: true,
      rankingWeight: true,
      canPublishWithoutReview: true,
      canManageMembers: true,
      canDeleteOwnContent: true,
      canDeleteMemberContent: true,
      canDeleteAllContent: true,
      canEditOwnContent: true,
      canEditMemberContent: true,
      canEditAllContent: true,
      registeredAt: true,
      reviewedAt: true,
      createdAt: true,
      _count: { select: { articles: true } },
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
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  // Batch lookup for this page; select only IDs, prioritizing pending applications.
  const memberIds = members.map((m) => m.id);
  const [pending, latest] = await Promise.all([
    prisma.enterpriseVerification.findMany({
      where: { memberId: { in: memberIds }, status: "pending" }, distinct: ["memberId"],
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, memberId: true },
    }),
    prisma.enterpriseVerification.findMany({
      where: { memberId: { in: memberIds } }, distinct: ["memberId"],
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, memberId: true },
    }),
  ]);
  const verificationIds = new Map([...latest, ...pending].map((v) => [v.memberId, v.id]));
  const items = isSuperAdmin(session)
    ? members.map((m) => ({ ...serializeMember(m), verificationId: verificationIds.get(m.id) ?? null }))
    : members
        .filter((m) => m.id !== session.sub)
        .map((m) => ({
          id: m.id,
          displayName: m.name?.trim() || m.email,
          verificationId: verificationIds.get(m.id) ?? null,
          recoveryEmail: m.recoveryEmail ?? null,
          role: m.role,
          memberType: m.memberType,
          enterpriseId: m.enterprise?.id || null,
          enterpriseName: m.enterprise?.companyShortName || m.enterprise?.companyName || null,
          brandName: m.enterprise?.brand?.name || null,
        }));

  return NextResponse.json({ items, total, page, limit, totalPages });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { account, email, password, name, role, memberType, memberTypeExpiresAt, rankingWeight, recoveryEmail } = body;

    const accountValue = typeof account === "string" ? account : typeof email === "string" ? email : "";
    if (!accountValue || !password || typeof password !== "string") {
      return NextResponse.json({ error: "账号与密码必填" }, { status: 400 });
    }

    const safeRole = role === "ADMIN" || role === "MEMBER" ? role : "MEMBER";

    if (session.role === "ADMIN") {
      if (!session.canManageMembers) {
        return NextResponse.json({ error: "当前子管理员未开通“添加会员”权限" }, { status: 403 });
      }
      if (safeRole !== "MEMBER") {
        return NextResponse.json({ error: "子管理员只能创建会员账号" }, { status: 403 });
      }
    }

    const normalizedEmail = String(accountValue).trim();
    const existing = await prisma.member.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "该账号已存在" }, { status: 400 });
    }

    const safeRecoveryEmail =
      typeof recoveryEmail === "string" && recoveryEmail.trim()
        ? normalizeRecoveryEmail(recoveryEmail)
        : null;
    if (typeof recoveryEmail === "string" && recoveryEmail.trim() && !safeRecoveryEmail) {
      return NextResponse.json({ error: "找回邮箱格式不正确" }, { status: 400 });
    }

    const safeMemberType =
      memberType === "enterprise_basic" || memberType === "enterprise_advanced" || memberType === "personal"
        ? memberType
        : "enterprise_basic";

    const expiresAt =
      typeof memberTypeExpiresAt === "string" && memberTypeExpiresAt.trim()
        ? new Date(memberTypeExpiresAt)
        : null;

    const safeRankingWeight =
      typeof rankingWeight === "number" && Number.isFinite(rankingWeight) ? Math.max(0, rankingWeight) : 0;

    const passwordHash = await bcrypt.hash(String(password), 10);
    const permissionData = resolvePermissionFlags({ role: safeRole });

    const member = await prisma.member.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: typeof name === "string" ? name.trim() || null : null,
        recoveryEmail: safeRecoveryEmail,
        role: safeRole,
        membershipLevel: safeRole === "ADMIN" ? "admin" : "member",
        memberType: safeMemberType,
        memberTypeExpiresAt: expiresAt,
        rankingWeight: safeRankingWeight,
        ...permissionData,
      },
      select: {
        id: true,
        email: true,
        recoveryEmail: true,
        name: true,
        role: true,
        memberType: true,
        phone: true,
        phoneVerified: true,
        accountStatus: true,
        realName: true,
        identityDocumentType: true,
        identityDocumentNumber: true,
        identityDocumentFrontPath: true,
        identityDocumentBackPath: true,
        memberTypeExpiresAt: true,
        rankingWeight: true,
        canPublishWithoutReview: true,
        canManageMembers: true,
        canDeleteOwnContent: true,
        canDeleteMemberContent: true,
        canDeleteAllContent: true,
        canEditOwnContent: true,
        canEditMemberContent: true,
        canEditAllContent: true,
        registeredAt: true,
        reviewedAt: true,
        createdAt: true,
        _count: { select: { articles: true } },
      },
    });

    await writeOperationLog({
      actorId: session.sub,
      actorEmail: session.email,
      action: "member_account_create",
      targetType: "member",
      targetId: member.id,
      detail: JSON.stringify({ role: member.role, recoveryEmail: member.recoveryEmail }),
    });

    return NextResponse.json(serializeMember(member));
  } catch (e) {
    console.error("POST /api/admin/members", e);
    const msg =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? e.message
        : "创建失败，请稍后重试";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
