"use client";

import { useEffect, useMemo, useState } from "react";
import { InlinePageBackLink } from "@/components/InlinePageBackLink";

type MemberRow = {
  id: string;
  account: string;
  name: string | null;
  role: string | null;
  memberType: string;
  canPublishWithoutReview: boolean;
  canManageMembers: boolean;
  canDeleteOwnContent: boolean;
  canDeleteMemberContent: boolean;
  canDeleteAllContent: boolean;
  canEditOwnContent: boolean;
  canEditMemberContent: boolean;
  canEditAllContent: boolean;
  createdAt: string;
};

type EditablePermissionKey =
  | "canManageMembers"
  | "canEditOwnContent"
  | "canEditMemberContent"
  | "canDeleteOwnContent"
  | "canDeleteMemberContent";

type PermissionDefinition = {
  key: EditablePermissionKey;
  label: string;
  description: string;
};

const EDITABLE_PERMISSIONS: PermissionDefinition[] = [
  {
    key: "canManageMembers",
    label: "新增会员",
    description: "允许子管理员新增会员账号，但不能创建子管理员或主管理员。",
  },
  {
    key: "canEditOwnContent",
    label: "修改本人内容",
    description: "允许直接修改自己提交的内容，不必走修改申请。",
  },
  {
    key: "canEditMemberContent",
    label: "修改会员内容",
    description: "允许直接修改其他会员提交的内容，适合企业内容协作。",
  },
  {
    key: "canDeleteOwnContent",
    label: "删除本人内容",
    description: "允许直接删除自己提交的内容。",
  },
  {
    key: "canDeleteMemberContent",
    label: "删除会员内容",
    description: "允许删除其他会员提交的内容，建议谨慎授予。",
  },
];

const ROLE_CARDS = [
  {
    role: "MEMBER",
    title: "会员",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    bullets: [
      "只能提交内容、查看审核进度、提交修改申请。",
      "不能免审发布，不能参与后台管理，也不能审核他人内容。",
    ],
  },
  {
    role: "ADMIN",
    title: "子管理员",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    bullets: [
      "默认可免审发布，并可审核会员发布或修改的一切内容。",
      "可按授权新增会员、编辑会员内容、删除会员内容，但不能修改系统设置或权限分配。",
    ],
  },
  {
    role: "SUPER_ADMIN",
    title: "主管理员",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    bullets: [
      "拥有子管理员全部审核与内容能力。",
      "额外保留权限分配、系统设置和全局最高权限。",
    ],
  },
];

function formatRole(role: string | null) {
  if (role === "SUPER_ADMIN") return "主管理员";
  if (role === "ADMIN") return "子管理员";
  return "会员";
}

function formatMemberType(memberType: string) {
  if (memberType === "enterprise_advanced") return "企业VIP会员";
  if (memberType === "enterprise_basic") return "企业基础会员";
  return "个人会员";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleTone(role: string | null) {
  if (role === "SUPER_ADMIN") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (role === "ADMIN") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function fixedPermissionLabels(member: MemberRow) {
  if (member.role === "SUPER_ADMIN") {
    return ["全内容审核", "权限分配", "全局编辑", "全局删除", "系统设置"];
  }

  if (member.role === "ADMIN") {
    return ["全内容审核", "免审发布"];
  }

  const labels: string[] = [];
  if (member.canPublishWithoutReview) labels.push("免审发布");
  if (member.canEditAllContent) labels.push("全局编辑");
  if (member.canDeleteAllContent) labels.push("全局删除");
  return labels;
}

function Toggle({
  checked,
  onClick,
  disabled,
}: {
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-w-16 items-center justify-center rounded-full border px-3 py-1 text-xs font-medium transition ${
        checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-white text-muted"
      } ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-accent hover:text-accent"}`}
    >
      {checked ? "已开启" : "未开启"}
    </button>
  );
}

export default function AdminPermissionsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const isSuperAdmin = role === "SUPER_ADMIN";

  async function load() {
    const meRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!meRes.ok) {
      setLoading(false);
      return;
    }

    const me = await meRes.json();
    setRole(me.role ?? null);

    if (me.role !== "SUPER_ADMIN") {
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/members?limit=500", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setMembers(Array.isArray(data.items) ? data.items : []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [members]
  );

  const stats = useMemo(() => {
    const superAdmins = sortedMembers.filter((item) => item.role === "SUPER_ADMIN").length;
    const admins = sortedMembers.filter((item) => item.role === "ADMIN").length;
    const membersOnly = sortedMembers.filter((item) => item.role !== "SUPER_ADMIN" && item.role !== "ADMIN").length;
    return { superAdmins, admins, membersOnly, total: sortedMembers.length };
  }, [sortedMembers]);

  async function updateMember(id: string, patch: Partial<Record<EditablePermissionKey, boolean>>) {
    const patchKey = Object.keys(patch)[0] ?? "unknown";
    setSavingKey(`${id}:${patchKey}`);

    const res = await fetch(`/api/admin/members/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSavingKey(null);
      setMessage(data.error ?? "更新失败");
      return;
    }

    setMembers((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data, account: data.account ?? data.email ?? item.account } : item))
    );
    setSavingKey(null);
    setMessage("权限已更新");
  }

  if (loading) return <p className="text-muted">加载中...</p>;
  if (!isSuperAdmin) return <p className="text-muted">此页面仅主管理员可见。</p>;

  return (
    <div className="max-w-6xl space-y-6">
      <InlinePageBackLink href="/membership/admin" label="返回后台首页" />
      <header className="rounded-2xl border border-border bg-surface-elevated p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              企业后台权限中枢
            </div>
            <h1 className="font-serif text-2xl font-bold text-primary">权限授予</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted">
              这里直接按角色和账号说明真实权限边界，确保页面展示与后端规则一致。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="总账号数" value={String(stats.total)} />
            <StatCard label="主管理员" value={String(stats.superAdmins)} />
            <StatCard label="子管理员" value={String(stats.admins)} />
            <StatCard label="会员" value={String(stats.membersOnly)} />
          </div>
        </div>

        {message ? <p className="mt-4 text-sm text-accent">{message}</p> : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {ROLE_CARDS.map((item) => (
          <article key={item.role} className={`rounded-2xl border p-5 ${item.tone}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-serif text-lg font-semibold">{item.title}</h2>
              <span className="rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-medium">
                {item.role}
              </span>
            </div>
            <div className="space-y-2 text-sm leading-6">
              {item.bullets.map((bullet) => (
                <p key={bullet}>{bullet}</p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-surface-elevated p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-primary">授权原则</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-muted">
              <p>1. 会员默认走审核流，不能直接发布，也不能参与后台管理。</p>
              <p>2. 子管理员默认可免审发布，并可审核会员发布或修改的一切内容。</p>
              <p>3. 主管理员保留系统设置、权限分配和全局最高权限。</p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-surface p-4">
            <p className="text-sm font-semibold text-primary">页面阅读方式</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-muted">
              <p>1. 先看角色标签，确认是会员、子管理员还是主管理员。</p>
              <p>2. 再看“固定能力”，这里显示该角色天然拥有、不会在本页拆掉的权限。</p>
              <p>3. 最后看“可授权能力”，这里只有子管理员会出现可切换开关。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {sortedMembers.map((member) => {
          const fixedLabels = fixedPermissionLabels(member);
          const editable = member.role === "ADMIN";

          return (
            <article key={member.id} className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${roleTone(member.role)}`}>
                      {formatRole(member.role)}
                    </span>
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
                      {formatMemberType(member.memberType)}
                    </span>
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
                      创建于 {formatDate(member.createdAt)}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-primary">{member.name?.trim() || "未命名账号"}</h2>
                    <p className="mt-1 text-sm text-muted">{member.account}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted xl:min-w-[280px]">
                  {member.role === "SUPER_ADMIN" ? (
                    <p>这是主管理员账号，负责系统设置、权限分配和全局最高权限控制。</p>
                  ) : member.role === "ADMIN" ? (
                    <p>这是子管理员账号，默认可免审发布，并可审核会员发布或修改的一切内容，但不能改系统设置或权限分配。</p>
                  ) : (
                    <p>这是个人会员账号，可参与内容投稿、词库贡献、标准反馈与标准共建，本页不提供额外后台授权。</p>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <section className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-primary">固定能力</h3>
                    <span className="text-xs text-muted">角色自动生效</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {fixedLabels.length > 0 ? (
                      fixedLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                        无额外固定后台权限
                      </span>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-primary">可授权能力</h3>
                    <span className="text-xs text-muted">{editable ? "仅对子管理员开放" : "当前角色不可单独授予"}</span>
                  </div>

                  {editable ? (
                    <div className="mt-4 space-y-3">
                      {EDITABLE_PERMISSIONS.map((permission) => {
                        const isSaving = savingKey === `${member.id}:${permission.key}`;
                        return (
                          <div
                            key={permission.key}
                            className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4 md:flex-row md:items-center md:justify-between"
                          >
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-primary">{permission.label}</p>
                              <p className="text-xs leading-5 text-muted">{permission.description}</p>
                            </div>

                            <div className="flex items-center gap-3">
                              {isSaving ? <span className="text-xs text-muted">保存中...</span> : null}
                              <Toggle
                                checked={member[permission.key]}
                                disabled={isSaving}
                                onClick={() =>
                                  void updateMember(member.id, {
                                    [permission.key]: !member[permission.key],
                                  })
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-elevated p-4 text-sm leading-6 text-muted">
                      {member.role === "SUPER_ADMIN"
                        ? "主管理员权限固定，不在此页拆分开关。"
                        : "会员不参与后台管理，本页不提供可切换权限。"}
                    </div>
                  )}
                </section>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 text-center">
      <div className="text-lg font-semibold text-primary">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}
