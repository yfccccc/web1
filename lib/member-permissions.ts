import type { ContentStatus } from "@/lib/member-access";

export type MemberRole = "SUPER_ADMIN" | "ADMIN" | "MEMBER";

export type PermissionFlags = {
  canPublishWithoutReview: boolean;
  canManageMembers: boolean;
  canDeleteOwnContent: boolean;
  canDeleteMemberContent: boolean;
  canDeleteAllContent: boolean;
  canEditOwnContent: boolean;
  canEditMemberContent: boolean;
  canEditAllContent: boolean;
};

type PermissionInput = {
  role: string | null | undefined;
} & Partial<PermissionFlags>;

const EMPTY_FLAGS: PermissionFlags = {
  canPublishWithoutReview: false,
  canManageMembers: false,
  canDeleteOwnContent: false,
  canDeleteMemberContent: false,
  canDeleteAllContent: false,
  canEditOwnContent: false,
  canEditMemberContent: false,
  canEditAllContent: false,
};

export function normalizeMemberRole(role: string | null | undefined): MemberRole {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return role;
  return "MEMBER";
}

export function resolvePermissionFlags(input: PermissionInput): PermissionFlags {
  const role = normalizeMemberRole(input.role);

  if (role === "SUPER_ADMIN") {
    return {
      canPublishWithoutReview: true,
      canManageMembers: true,
      canDeleteOwnContent: true,
      canDeleteMemberContent: true,
      canDeleteAllContent: true,
      canEditOwnContent: true,
      canEditMemberContent: true,
      canEditAllContent: true,
    };
  }

  if (role === "ADMIN") {
    const hasExplicitContentPermission =
      input.canDeleteOwnContent === true ||
      input.canDeleteMemberContent === true ||
      input.canDeleteAllContent === true ||
      input.canEditOwnContent === true ||
      input.canEditMemberContent === true ||
      input.canEditAllContent === true;

    return {
      canPublishWithoutReview: true,
      canManageMembers: input.canManageMembers === true,
      // Backward compatibility: legacy ADMIN accounts created before granular
      // permission flags existed should still be able to manage content.
      canDeleteOwnContent: hasExplicitContentPermission ? input.canDeleteOwnContent === true : true,
      canDeleteMemberContent: hasExplicitContentPermission ? input.canDeleteMemberContent === true : true,
      canDeleteAllContent: false,
      canEditOwnContent: hasExplicitContentPermission ? input.canEditOwnContent === true : true,
      canEditMemberContent: hasExplicitContentPermission ? input.canEditMemberContent === true : true,
      canEditAllContent: false,
    };
  }

  return {
    ...EMPTY_FLAGS,
    canPublishWithoutReview: input.canPublishWithoutReview === true,
    canDeleteOwnContent: input.canDeleteOwnContent === true,
    canEditOwnContent: input.canEditOwnContent === true,
  };
}

export function resolveSubmissionStatus(options?: {
  reviewRequired?: boolean;
  role?: string | null;
  canPublishWithoutReview?: boolean;
}): ContentStatus {
  const role = normalizeMemberRole(options?.role);
  const canBypass = options?.canPublishWithoutReview ?? false;

  if (role === "SUPER_ADMIN") return "approved";
  if (role === "ADMIN" || canBypass) return "approved";
  return "pending";
}

export function mergeEffectivePermissionFlags<T extends PermissionInput>(input: T): T & PermissionFlags {
  return {
    ...input,
    ...resolvePermissionFlags(input),
  };
}
