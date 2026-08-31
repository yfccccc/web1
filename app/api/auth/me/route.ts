import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getEffectiveMemberAccessForMember } from "@/lib/member-access-resolver";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const memberAccess = await getEffectiveMemberAccessForMember(session.sub, session.memberType);
  const membershipRule = memberAccess.membershipRule;

  return NextResponse.json({
    id: session.sub,
    account: session.account,
    name: session.name,
    displayName: session.displayName,
    email: session.email,
    phone: session.phone,
    phoneVerified: session.phoneVerified,
    accountStatus: session.accountStatus,
    role: session.role,
    memberType: session.memberType,
    rankingWeight: session.rankingWeight,
    memberTypeExpiresAt: session.memberTypeExpiresAt,
    canPublishWithoutReview: session.canPublishWithoutReview,
    canManageMembers: session.canManageMembers,
    canDeleteOwnContent: session.canDeleteOwnContent,
    canDeleteMemberContent: session.canDeleteMemberContent,
    canDeleteAllContent: session.canDeleteAllContent,
    canEditOwnContent: session.canEditOwnContent,
    canEditMemberContent: session.canEditMemberContent,
    canEditAllContent: session.canEditAllContent,
    memberTypeLabel: membershipRule.label,
    membershipRule,
    memberAccess,
  });
}
