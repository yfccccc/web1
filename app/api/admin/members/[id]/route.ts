import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { normalizeRecoveryEmail } from "@/lib/password-recovery";
import { prisma } from "@/lib/prisma";
import { writeOperationLog } from "@/lib/operation-log";
import { mergeEffectivePermissionFlags, resolvePermissionFlags } from "@/lib/member-permissions";

function isSuperAdmin(session: { role: string | null } | null) {
  return session?.role === "SUPER_ADMIN";
}

function normalizeAccount(value: string) {
  return value.trim().toLowerCase();
}

function serializeMember(
  member: {
    id: string;
    email: string;
    recoveryEmail?: string | null;
    name: string | null;
    role: string | null;
    memberType: string;
    memberTypeExpiresAt: Date | null;
    rankingWeight: number;
    canPublishWithoutReview: boolean;
    canManageMembers: boolean;
    canDeleteOwnContent: boolean;
    canDeleteMemberContent: boolean;
    canDeleteAllContent: boolean;
    canEditOwnContent: boolean;
    canEditMemberContent: boolean;
    canEditAllContent: boolean;
    createdAt: Date;
  }
) {
  return {
    ...mergeEffectivePermissionFlags(member),
    account: member.email,
    recoveryEmail: member.recoveryEmail ?? null,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session)) {
    return NextResponse.json({ error: "需要主管理员权限" }, { status: 403 });
  }

  const { id } = await params;
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) return NextResponse.json({ error: "账号不存在" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const {
    account,
    email,
    name,
    password,
    recoveryEmail,
    memberType,
    memberTypeExpiresAt,
    rankingWeight,
    canPublishWithoutReview,
    role,
    canManageMembers,
    canDeleteOwnContent,
    canDeleteMemberContent,
    canDeleteAllContent,
    canEditOwnContent,
    canEditMemberContent,
    canEditAllContent,
    accountStatus,
  } = body;

  const data: {
    email?: string;
    name?: string | null;
    passwordHash?: string;
    recoveryEmail?: string | null;
    membershipLevel?: string;
    memberType?: string;
    memberTypeExpiresAt?: Date | null;
    rankingWeight?: number;
    canPublishWithoutReview?: boolean;
    role?: string;
    canManageMembers?: boolean;
    canDeleteOwnContent?: boolean;
    canDeleteMemberContent?: boolean;
    canDeleteAllContent?: boolean;
    canEditOwnContent?: boolean;
    canEditMemberContent?: boolean;
    canEditAllContent?: boolean;
    accountStatus?: string;
    reviewedAt?: Date | null;
    reviewedById?: string | null;
  } = {};

  if (typeof accountStatus === "string" && ["pending_review", "active", "rejected", "suspended"].includes(accountStatus)) {
    data.accountStatus = accountStatus;
    if (accountStatus !== "pending_review") {
      data.reviewedAt = new Date();
      data.reviewedById = session.sub;
    }
  }

  const accountValue = typeof account === "string" ? account : typeof email === "string" ? email : "";
  if (typeof accountValue === "string" && accountValue.trim()) {
    const normalizedAccount = normalizeAccount(accountValue);
    if (normalizedAccount.length < 4) {
      return NextResponse.json({ error: "账号至少 4 位" }, { status: 400 });
    }
    if (!/^[a-z0-9._-]+$/.test(normalizedAccount)) {
      return NextResponse.json({ error: "账号仅支持小写字母、数字、点、下划线和短横线" }, { status: 400 });
    }
    const existing = await prisma.member.findFirst({
      where: {
        email: normalizedAccount,
        id: { not: id },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "该账号已存在" }, { status: 400 });
    }
    if (id === session.sub && normalizedAccount !== member.email) {
      return NextResponse.json({ error: "不能修改当前登录主管理员账号" }, { status: 400 });
    }
    data.email = normalizedAccount;
  }
  if (typeof name === "string") data.name = name.trim() || null;
  if (typeof password === "string" && password.length > 0) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }
  if (recoveryEmail !== undefined) {
    const safeRecoveryEmail =
      typeof recoveryEmail === "string" && recoveryEmail.trim()
        ? normalizeRecoveryEmail(recoveryEmail)
        : null;
    if (typeof recoveryEmail === "string" && recoveryEmail.trim() && !safeRecoveryEmail) {
      return NextResponse.json({ error: "找回邮箱格式不正确" }, { status: 400 });
    }
    data.recoveryEmail = safeRecoveryEmail;
  }
  if (
    typeof memberType === "string" &&
    ["enterprise_basic", "personal", "enterprise_advanced"].includes(memberType)
  ) {
    data.memberType = memberType;
  }
  if (memberTypeExpiresAt !== undefined) {
    data.memberTypeExpiresAt =
      typeof memberTypeExpiresAt === "string" && memberTypeExpiresAt.trim()
        ? new Date(memberTypeExpiresAt)
        : null;
  }
  if (typeof rankingWeight === "number" && Number.isFinite(rankingWeight)) {
    data.rankingWeight = Math.max(0, rankingWeight);
  }

  if (typeof role === "string" && ["ADMIN", "MEMBER"].includes(role) && member.role !== "SUPER_ADMIN") {
    data.role = role;
    data.membershipLevel = role === "ADMIN" ? "admin" : "member";
  }

  if (member.role === "SUPER_ADMIN" && data.role) {
    return NextResponse.json({ error: "不能修改主管理员角色" }, { status: 400 });
  }

  const touchedPermissionFields =
    typeof canPublishWithoutReview === "boolean" ||
    typeof canManageMembers === "boolean" ||
    typeof canDeleteOwnContent === "boolean" ||
    typeof canDeleteMemberContent === "boolean" ||
    typeof canDeleteAllContent === "boolean" ||
    typeof canEditOwnContent === "boolean" ||
    typeof canEditMemberContent === "boolean" ||
    typeof canEditAllContent === "boolean" ||
    typeof data.role === "string";

  if (touchedPermissionFields) {
    Object.assign(
      data,
      resolvePermissionFlags({
        role: data.role ?? member.role,
        canPublishWithoutReview:
          typeof canPublishWithoutReview === "boolean"
            ? canPublishWithoutReview
            : member.canPublishWithoutReview,
        canManageMembers:
          typeof canManageMembers === "boolean" ? canManageMembers : member.canManageMembers,
        canDeleteOwnContent:
          typeof canDeleteOwnContent === "boolean"
            ? canDeleteOwnContent
            : member.canDeleteOwnContent,
        canDeleteMemberContent:
          typeof canDeleteMemberContent === "boolean"
            ? canDeleteMemberContent
            : member.canDeleteMemberContent,
        canDeleteAllContent:
          typeof canDeleteAllContent === "boolean"
            ? canDeleteAllContent
            : member.canDeleteAllContent,
        canEditOwnContent:
          typeof canEditOwnContent === "boolean" ? canEditOwnContent : member.canEditOwnContent,
        canEditMemberContent:
          typeof canEditMemberContent === "boolean"
            ? canEditMemberContent
            : member.canEditMemberContent,
        canEditAllContent:
          typeof canEditAllContent === "boolean" ? canEditAllContent : member.canEditAllContent,
      })
    );
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "请提供要更新的字段" }, { status: 400 });
  }

  const updated = await prisma.member.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      recoveryEmail: true,
      name: true,
      role: true,
      memberType: true,
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
      createdAt: true,
    },
  });

  await writeOperationLog({
    actorId: session.sub,
    actorEmail: session.email,
    action: "member_account_update",
    targetType: "member",
    targetId: id,
    detail: JSON.stringify({
      ...data,
      email: data.email ?? undefined,
      passwordHash: data.passwordHash ? "[updated]" : undefined,
    }),
  });

  return NextResponse.json(serializeMember(updated));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session)) {
    return NextResponse.json({ error: "需要主管理员权限" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.sub) {
    return NextResponse.json({ error: "不能删除当前登录账号" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  if (member.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "不能删除主管理员账号" }, { status: 400 });
  }

  await prisma.member.delete({ where: { id } });

  await writeOperationLog({
    actorId: session.sub,
    actorEmail: session.email,
    action: "member_account_delete",
    targetType: "member",
    targetId: id,
    detail: JSON.stringify({ email: member.email, role: member.role }),
  });

  return NextResponse.json({ ok: true });
}
