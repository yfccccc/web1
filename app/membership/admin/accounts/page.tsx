"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";

const PAGE_SIZE = 20;

type MemberRow = {
  id: string;
  account: string;
  recoveryEmail?: string | null;
  name: string | null;
  role: string | null;
  memberType: string;
  phoneMasked?: string | null;
  phoneVerified?: boolean;
  accountStatus?: string;
  realName?: string | null;
  identityDocumentType?: string | null;
  identityDocumentNumberMasked?: string | null;
  identityDocumentsUploaded?: boolean;
  reviewedAt?: string | null;
  articleCount?: number;
  canManageMembers: boolean;
  registeredAt: string | null;
  createdAt: string;
  enterprise?: {
    id: string;
    companyName: string | null;
    companyShortName: string | null;
    brand?: { id: string; name: string; slug: string } | null;
  } | null;
};

type AdminVisibleRow = {
  id: string;
  displayName: string;
  recoveryEmail?: string | null;
  role: string | null;
  memberType: string;
  enterpriseId?: string | null;
  enterpriseName?: string | null;
  brandName?: string | null;
};

function formatRegistrationTime(value: string | null | undefined) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function accountStatusLabel(value: string | null | undefined) {
  if (value === "pending_review") return "待审核";
  if (value === "active") return "已通过";
  if (value === "rejected") return "已驳回";
  if (value === "suspended") return "已停用";
  return value || "--";
}

export default function AdminAccountsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [visibleRows, setVisibleRows] = useState<AdminVisibleRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [myNewPassword, setMyNewPassword] = useState("");
  const [myNewPasswordConfirm, setMyNewPasswordConfirm] = useState("");
  const [myRecoveryEmail, setMyRecoveryEmail] = useState("");

  const [newAccount, setNewAccount] = useState("");
  const [newRecoveryEmail, setNewRecoveryEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const resultsRef = useRef<HTMLElement | null>(null);
  const shouldScrollToResultsRef = useRef(false);

  const isSuperAdmin = role === "SUPER_ADMIN";
  const isAdmin = role === "ADMIN";

  const load = useCallback(async () => {
    const meRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!meRes.ok) {
      setLoading(false);
      return;
    }
    const me = await meRes.json();
    setRole(me.role ?? null);
    setCanManageMembers(me.canManageMembers === true);

    const recoveryRes = await fetch("/api/auth/recovery-email", { credentials: "include" });
    if (recoveryRes.ok) {
      const recoveryData = await recoveryRes.json().catch(() => ({}));
      setMyRecoveryEmail(typeof recoveryData.recoveryEmail === "string" ? recoveryData.recoveryEmail : "");
    }

    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (keyword.trim()) params.set("q", keyword.trim());
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/admin/members${query}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (me.role === "SUPER_ADMIN") {
        setMembers(Array.isArray(data.items) ? data.items : []);
      } else {
        setVisibleRows(Array.isArray(data.items) ? data.items : []);
      }
      setTotal(typeof data.total === "number" ? data.total : 0);
      setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
      if (typeof data.page === "number" && data.page !== page) setPage(data.page);
    }
    setLoading(false);
  }, [keyword, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || !shouldScrollToResultsRef.current) return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    shouldScrollToResultsRef.current = false;
  }, [loading, members.length, visibleRows.length]);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [members]
  );

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const res = await fetch("/api/admin/members", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: newAccount.trim(),
        recoveryEmail: newRecoveryEmail.trim() || undefined,
        password: newPassword,
        name: newName.trim() || undefined,
        role: newRole,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "创建失败");
      return;
    }

    if (isSuperAdmin) {
      setMembers((prev) => [{ ...data, account: data.account ?? data.email ?? "" }, ...prev]);
    }
    setNewAccount("");
    setNewRecoveryEmail("");
    setNewPassword("");
    setNewName("");
    setMessage(newRole === "ADMIN" ? "子管理员已创建" : "会员账号已创建");
  }

  async function updateMember(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/members/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "更新失败");
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...data, account: data.account ?? data.email ?? m.account } : m)));
    setMessage("已更新");
  }

  async function renameMemberAccount(member: MemberRow) {
    const nextAccount = prompt(
      "输入新的登录账号\n仅支持小写字母、数字、点、下划线和短横线",
      member.account || ""
    );
    if (nextAccount === null) return;
    const trimmed = nextAccount.trim().toLowerCase();
    if (!trimmed) {
      setMessage("账号不能为空");
      return;
    }
    await updateMember(member.id, { account: trimmed });
  }

  async function removeMember(id: string) {
    if (!confirm("确认删除该账号？")) return;
    const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "删除失败");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setMessage("已删除");
  }

  async function changeMyPassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!currentPassword || !myNewPassword || !myNewPasswordConfirm) {
      setMessage("请完整填写修改密码信息");
      return;
    }
    if (myNewPassword !== myNewPasswordConfirm) {
      setMessage("两次输入的新密码不一致");
      return;
    }

    const res = await fetch("/api/auth/password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword,
        newPassword: myNewPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "修改密码失败");
      return;
    }

    setCurrentPassword("");
    setMyNewPassword("");
    setMyNewPasswordConfirm("");
    setMessage("我的密码已更新");
  }

  async function saveRecoveryEmail(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const res = await fetch("/api/auth/recovery-email", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryEmail: myRecoveryEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "保存找回邮箱失败");
      return;
    }
    setMyRecoveryEmail(typeof data.recoveryEmail === "string" ? data.recoveryEmail : "");
    setMessage(data.recoveryEmail ? "找回邮箱已保存" : "找回邮箱已清空");
  }

  if (loading) return <p className="text-muted">加载中...</p>;

  if (!isSuperAdmin && !isAdmin) {
    return <p className="text-muted">需要管理员权限。</p>;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="font-serif text-xl font-bold text-primary">账号一览</h1>
        <p className="text-sm text-muted mt-1">
          {isSuperAdmin
            ? "用于创建/维护管理员与会员账号。支持按会员、企业名称或品牌名称快速搜索。"
            : canManageMembers
              ? "你可创建会员账号，并可通过企业或品牌名称快速定位账号。"
              : "你当前无新增账号权限。"}
        </p>
        <p className="mt-2 text-xs text-muted">
          未绑定找回邮箱的老账号，可在
          <Link href="/membership/admin/password-recovery-requests" className="mx-1 text-accent hover:underline">
            密码找回申请
          </Link>
          中集中处理。
        </p>
        {message && <p className="text-sm text-accent mt-2">{message}</p>}
      </header>

      <section className="rounded-xl border border-border bg-surface-elevated p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            shouldScrollToResultsRef.current = true;
            setPage(1);
            setKeyword(searchDraft.trim());
          }}
          className="flex flex-col gap-3 md:flex-row md:items-end"
        >
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-xs text-muted">搜索会员 / 企业 / 品牌</span>
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="输入账号、会员名称、企业名称或品牌名称"
              className="px-3 py-2 border border-border rounded bg-surface text-sm"
            />
          </label>
          <div className="flex gap-3">
            <button type="submit" className="px-4 py-2 rounded bg-accent text-white text-sm">
              搜索
            </button>
            {keyword ? (
              <button
                type="button"
                onClick={() => {
                  setKeyword("");
                  setSearchDraft("");
                  setPage(1);
                }}
                className="px-4 py-2 rounded border border-border bg-white text-sm text-primary"
              >
                清空
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface-elevated p-4">
        <h2 className="text-sm font-medium text-primary mb-3">修改我的密码</h2>
        <form onSubmit={changeMyPassword} className="grid md:grid-cols-4 gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">旧密码</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="px-3 py-2 border border-border rounded bg-surface text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">新密码</span>
            <input
              type="password"
              value={myNewPassword}
              onChange={(e) => setMyNewPassword(e.target.value)}
              required
              minLength={6}
              className="px-3 py-2 border border-border rounded bg-surface text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">确认新密码</span>
            <input
              type="password"
              value={myNewPasswordConfirm}
              onChange={(e) => setMyNewPasswordConfirm(e.target.value)}
              required
              minLength={6}
              className="px-3 py-2 border border-border rounded bg-surface text-sm"
            />
          </label>
          <div>
            <button type="submit" className="px-4 py-2 rounded bg-accent text-white text-sm">
              修改我的密码
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface-elevated p-4">
        <h2 className="text-sm font-medium text-primary mb-3">我的找回邮箱</h2>
        <form onSubmit={saveRecoveryEmail} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">找回邮箱</span>
            <input
              type="email"
              value={myRecoveryEmail}
              onChange={(e) => setMyRecoveryEmail(e.target.value)}
              placeholder="建议填写常用邮箱，用于密码找回"
              className="px-3 py-2 border border-border rounded bg-surface text-sm"
            />
          </label>
          <div>
            <button type="submit" className="px-4 py-2 rounded bg-accent text-white text-sm">
              保存找回邮箱
            </button>
          </div>
        </form>
      </section>

      {isAdmin && !canManageMembers && (
        <section ref={resultsRef} className="rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium text-primary mb-3">可见账号</h2>
          {visibleRows.length === 0 ? (
            <p className="text-sm text-muted">暂无可见账号</p>
          ) : (
            <ul className="space-y-2">
              {visibleRows.map((row) => (
                <li key={row.id} className="text-sm text-primary border-b border-border pb-2 last:border-0">
                  {row.enterpriseId ? (
                    <Link href={`/enterprise/${row.enterpriseId}`} className="hover:text-accent hover:underline">
                      {row.displayName}
                    </Link>
                  ) : (
                    <span>{row.displayName}</span>
                  )}
                  {(row.enterpriseName || row.brandName) ? (
                      <span className="ml-2 text-xs text-muted">
                        {row.enterpriseName || "未绑定企业"}
                        {row.brandName ? ` / ${row.brandName}` : ""}
                      </span>
                    ) : null}
                  {row.recoveryEmail ? <span className="ml-2 text-xs text-muted">找回邮箱：{row.recoveryEmail}</span> : null}
                  <span className="ml-2">（{row.role === "ADMIN" ? "子管理员" : "会员"} / {row.memberType}）</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(isSuperAdmin || canManageMembers) && (
        <form onSubmit={addAccount} className="rounded-xl border border-border bg-surface-elevated p-4 grid md:grid-cols-5 gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">账号类型</span>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as "ADMIN" | "MEMBER")} className="px-3 py-2 border border-border rounded bg-surface text-sm" disabled={isAdmin}>
              <option value="MEMBER">会员</option>
              {isSuperAdmin && <option value="ADMIN">子管理员</option>}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">账号</span>
            <input value={newAccount} onChange={(e) => setNewAccount(e.target.value)} required className="px-3 py-2 border border-border rounded bg-surface text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">找回邮箱</span>
            <input type="email" value={newRecoveryEmail} onChange={(e) => setNewRecoveryEmail(e.target.value)} className="px-3 py-2 border border-border rounded bg-surface text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">密码</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="px-3 py-2 border border-border rounded bg-surface text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">姓名（选填）</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="px-3 py-2 border border-border rounded bg-surface text-sm" />
          </label>
          <div className="md:col-span-4">
            <button className="px-4 py-2 rounded bg-accent text-white text-sm">创建账号</button>
          </div>
        </form>
      )}

      {isSuperAdmin && (
        <section ref={resultsRef} className="rounded-xl border border-border bg-surface-elevated p-4 overflow-x-auto">
          <h2 className="text-sm font-medium text-primary mb-3">账号列表</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2">账号</th>
                  <th className="text-left py-2">找回邮箱</th>
                  <th className="text-left py-2">角色</th>
                  <th className="text-left py-2">会员类型</th>
                  <th className="text-left py-2">手机号</th>
                  <th className="text-left py-2">实名信息</th>
                  <th className="text-left py-2">审核状态</th>
                  <th className="text-left py-2">注册时间</th>
                  <th className="text-left py-2">文章数量</th>
                  <th className="text-left py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">
                    <div>
                      <Link href={`/membership/admin/accounts/${m.id}`} className="text-primary hover:text-accent hover:underline">
                        {m.account}
                      </Link>
                    </div>
                    <div className="text-xs text-muted">{m.name || "未命名"}</div>
                    {m.enterprise ? (
                      <div className="text-xs text-muted">
                        {m.enterprise?.id ? (
                          <Link href={`/enterprise/${m.enterprise.id}`} className="hover:text-accent hover:underline">
                            {m.enterprise.companyShortName || m.enterprise.companyName || "未绑定企业"}
                          </Link>
                        ) : (
                          <span>{m.enterprise.companyShortName || m.enterprise.companyName || "未绑定企业"}</span>
                        )}
                        {m.enterprise.brand?.name ? ` / ${m.enterprise.brand.name}` : ""}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-muted">{m.recoveryEmail || "未设置"}</td>
                  <td className="py-2 pr-4 text-muted">{m.role === "SUPER_ADMIN" ? "主管理员" : m.role === "ADMIN" ? "子管理员" : "会员"}</td>
                  <td className="py-2 pr-4 text-muted">{m.memberType}</td>
                  <td className="py-2 pr-4 text-muted whitespace-nowrap">
                    <div>{m.phoneMasked || "未填写"}</div>
                    <div className="text-xs">{m.phoneVerified ? "已验证" : "未验证"}</div>
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    <div>{m.realName || "未填写"}</div>
                    <div className="text-xs">
                      {m.identityDocumentType || "未填写证件类型"}
                      {m.identityDocumentNumberMasked ? ` / ${m.identityDocumentNumberMasked}` : ""}
                    </div>
                    {m.identityDocumentsUploaded ? (
                      <div className="mt-1 flex gap-2 text-xs">
                        <a href={`/api/admin/members/${m.id}/identity-documents/front`} target="_blank" rel="noreferrer" className="text-accent hover:underline">证件正面</a>
                        <a href={`/api/admin/members/${m.id}/identity-documents/back`} target="_blank" rel="noreferrer" className="text-accent hover:underline">证件反面</a>
                      </div>
                    ) : (
                      <div className="text-xs">证件未完整上传</div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-muted whitespace-nowrap">
                    <div>{accountStatusLabel(m.accountStatus)}</div>
                    {m.reviewedAt ? <div className="text-xs">{formatRegistrationTime(m.reviewedAt)}</div> : null}
                  </td>
                  <td className="py-2 pr-4 text-muted whitespace-nowrap">{formatRegistrationTime(m.registeredAt)}</td>
                  <td className="py-2 pr-4 text-muted">{m.articleCount ?? 0}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-3">
                      {m.memberType === "personal" && m.accountStatus === "pending_review" ? (
                        <>
                          <button
                            className="apple-inline-link"
                            type="button"
                            onClick={() => {
                              if (confirm("确认审核通过该个人会员账号？")) void updateMember(m.id, { accountStatus: "active" });
                            }}
                          >
                            审核通过
                          </button>
                          <button
                            className="text-xs text-red-600 hover:underline"
                            type="button"
                            onClick={() => {
                              if (confirm("确认驳回该个人会员账号？")) void updateMember(m.id, { accountStatus: "rejected" });
                            }}
                          >
                            驳回
                          </button>
                        </>
                      ) : null}
                      <button
                        className="apple-inline-link"
                        type="button"
                        onClick={() => renameMemberAccount(m)}
                      >
                        修改账号
                      </button>
                      <button
                        className="apple-inline-link"
                        type="button"
                        onClick={() => {
                          const recoveryEmail = prompt("输入找回邮箱（留空表示清空）", m.recoveryEmail || "");
                          if (recoveryEmail === null) return;
                          updateMember(m.id, { recoveryEmail });
                        }}
                      >
                        找回邮箱
                      </button>
                      <button
                        className="apple-inline-link"
                        type="button"
                        onClick={() => {
                          const password = prompt("输入新密码（留空取消）");
                          if (!password) return;
                          updateMember(m.id, { password });
                        }}
                      >
                        修改密码
                      </button>
                      {m.role !== "SUPER_ADMIN" && (
                        <button className="text-xs text-red-600 hover:underline" type="button" onClick={() => removeMember(m.id)}>
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <AdminPagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} currentCount={isSuperAdmin ? members.length : visibleRows.length} loading={loading} onPageChange={setPage} />
    </div>
  );
}
