import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { asMemberType, ensureEffectiveMemberType, type MemberType } from "@/lib/member-access";
import { resolvePermissionFlags } from "@/lib/member-permissions";

export type Session = {
  sub: string;
  account: string;
  name: string | null;
  displayName: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  accountStatus: string;
  role: string | null;
  memberType: MemberType;
  rankingWeight: number;
  memberTypeExpiresAt: string | null;
  lockedUntil: Date | null;
  canPublishWithoutReview: boolean;
  canManageMembers: boolean;
  canDeleteOwnContent: boolean;
  canDeleteMemberContent: boolean;
  canDeleteAllContent: boolean;
  canEditOwnContent: boolean;
  canEditMemberContent: boolean;
  canEditAllContent: boolean;
};

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  let dbMember:
    | {
        id: string;
        email: string;
        phone: string | null;
        phoneVerified?: boolean;
        accountStatus?: string;
        name: string | null;
        enterprise?: {
          companyShortName: string | null;
          companyName: string | null;
          contactPerson: string | null;
        } | null;
        role: string | null;
        memberType: string;
        rankingWeight: number;
        memberTypeExpiresAt: Date | null;
        lockedUntil: Date | null;
        canPublishWithoutReview: boolean;
        canManageMembers?: boolean;
        canDeleteOwnContent?: boolean;
        canDeleteMemberContent?: boolean;
        canDeleteAllContent?: boolean;
        canEditOwnContent?: boolean;
        canEditMemberContent?: boolean;
        canEditAllContent?: boolean;
      }
    | null = null;

  try {
    dbMember = await prisma.member.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        phone: true,
        phoneVerified: true,
        accountStatus: true,
        name: true,
        enterprise: {
          select: {
            companyShortName: true,
            companyName: true,
            contactPerson: true,
          },
        },
        role: true,
        memberType: true,
        rankingWeight: true,
        memberTypeExpiresAt: true,
        lockedUntil: true,
        canPublishWithoutReview: true,
        canManageMembers: true,
        canDeleteOwnContent: true,
        canDeleteMemberContent: true,
        canDeleteAllContent: true,
        canEditOwnContent: true,
        canEditMemberContent: true,
        canEditAllContent: true,
      },
    });
  } catch {
    dbMember = await prisma.member.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        enterprise: {
          select: {
            companyShortName: true,
            companyName: true,
            contactPerson: true,
          },
        },
        role: true,
        memberType: true,
        rankingWeight: true,
        memberTypeExpiresAt: true,
        lockedUntil: true,
        canPublishWithoutReview: true,
      },
    });
  }

  if (!dbMember) return null;
  if (dbMember.lockedUntil && dbMember.lockedUntil > new Date()) return null;

  const effective = await ensureEffectiveMemberType({
    id: dbMember.id,
    memberType: dbMember.memberType,
    memberTypeExpiresAt: dbMember.memberTypeExpiresAt,
    rankingWeight: dbMember.rankingWeight,
  });

  const resolvedRole = dbMember.role ?? payload.role ?? null;
  const permissions = resolvePermissionFlags({
    role: resolvedRole,
    canPublishWithoutReview: dbMember.canPublishWithoutReview ?? false,
    canManageMembers: dbMember.canManageMembers ?? false,
    canDeleteOwnContent: dbMember.canDeleteOwnContent ?? false,
    canDeleteMemberContent: dbMember.canDeleteMemberContent ?? false,
    canDeleteAllContent: dbMember.canDeleteAllContent ?? false,
    canEditOwnContent: dbMember.canEditOwnContent ?? false,
    canEditMemberContent: dbMember.canEditMemberContent ?? false,
    canEditAllContent: dbMember.canEditAllContent ?? false,
  });

  const isAdminRole = resolvedRole === "SUPER_ADMIN" || resolvedRole === "ADMIN";
  const accountLabel = dbMember.email.split("@")[0]?.trim() || dbMember.email.trim();
  const isEnterpriseMember = effective.memberType === "enterprise_basic" || effective.memberType === "enterprise_advanced";
  const displayName = isAdminRole
    ? accountLabel || dbMember.name?.trim() || "管理员"
    : isEnterpriseMember
      ? dbMember.enterprise?.companyShortName?.trim() || dbMember.enterprise?.companyName?.trim() || "企业会员"
      : dbMember.name?.trim() || accountLabel || "会员";

  return {
    sub: payload.sub,
    account: dbMember.email,
    name: dbMember.name ?? null,
    displayName,
    email: payload.email,
    phone: dbMember.phone ?? null,
    phoneVerified: dbMember.phoneVerified ?? false,
    accountStatus: dbMember.accountStatus ?? "active",
    role: resolvedRole,
    memberType: asMemberType(effective.memberType),
    rankingWeight: effective.rankingWeight,
    memberTypeExpiresAt: dbMember.memberTypeExpiresAt?.toISOString() ?? null,
    lockedUntil: dbMember.lockedUntil,
    canPublishWithoutReview: permissions.canPublishWithoutReview,
    canManageMembers: permissions.canManageMembers,
    canDeleteOwnContent: permissions.canDeleteOwnContent,
    canDeleteMemberContent: permissions.canDeleteMemberContent,
    canDeleteAllContent: permissions.canDeleteAllContent,
    canEditOwnContent: permissions.canEditOwnContent,
    canEditMemberContent: permissions.canEditMemberContent,
    canEditAllContent: permissions.canEditAllContent,
  };
}

export function requireSuperAdmin(session: Session | null): boolean {
  return session?.role === "SUPER_ADMIN";
}

export function requireAdminOrSuper(session: Session | null): boolean {
  return session?.role === "SUPER_ADMIN" || session?.role === "ADMIN";
}
