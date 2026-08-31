import type { ReactNode } from "react";
import Link from "next/link";

export type MemberPublishAccessBlock = {
  code: "pending_review" | "rejected" | "suspended" | "phone_unverified" | "quota_exhausted" | "unavailable";
  title: string;
  message: string;
};

export function resolveMemberPublishAccessBlock(input: {
  memberType: string;
  accountStatus: string | null | undefined;
  phoneVerified: boolean;
  categoryRemainingCount?: number | null;
  subcategoryRemainingCount?: number | null;
}): MemberPublishAccessBlock | null {
  if (input.memberType === "personal") {
    switch (input.accountStatus) {
      case "active":
        break;
      case "pending_review":
        return {
          code: "pending_review",
          title: "账号资料正在审核",
          message: "账号资料正在审核中，审核通过后即可投稿。",
        };
      case "rejected":
        return {
          code: "rejected",
          title: "账号审核未通过",
          message: "账号资料暂未通过审核，请按审核意见完善资料后再申请。",
        };
      case "suspended":
      case "disabled":
        return {
          code: "suspended",
          title: "账号投稿功能已停用",
          message: "当前账号暂不能投稿，如需恢复请联系平台管理员。",
        };
      default:
        return {
          code: "unavailable",
          title: "账号暂不能投稿",
          message: "当前账号状态尚未确认，请联系平台管理员核验后再投稿。",
        };
    }

    if (!input.phoneVerified) {
      return {
        code: "phone_unverified",
        title: "手机号尚未验证",
        message: "请先完成手机号验证，再使用内容投稿功能。",
      };
    }
  }

  if ((input.categoryRemainingCount ?? 1) <= 0 || (input.subcategoryRemainingCount ?? 1) <= 0) {
    return {
      code: "quota_exhausted",
      title: "本年度投稿额度已用完",
      message: "当前栏目本年度投稿额度已用完，可在下一年度额度恢复后继续投稿。",
    };
  }

  return null;
}

export function MemberPublishAccessBoundary({
  block,
  children,
}: {
  block: MemberPublishAccessBlock | null;
  children: ReactNode;
}) {
  if (!block) return <>{children}</>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12" data-member-publish-state={block.code}>
      <section className="rounded-[28px] border border-border bg-surface-elevated p-6 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Membership Review</p>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-primary">{block.title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted">{block.message}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/membership/content" className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white">
            返回会员工作台
          </Link>
          <Link href="/membership" className="rounded-full border border-border bg-white px-5 py-2.5 text-sm text-primary">
            查看会员说明
          </Link>
        </div>
      </section>
    </main>
  );
}
