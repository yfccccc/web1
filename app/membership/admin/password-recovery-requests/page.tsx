"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { InlinePageBackLink } from "@/components/InlinePageBackLink";
import { AdminPagination } from "@/components/admin/AdminPagination";

const PAGE_SIZE = 20;

type RequestStatus = "pending" | "processing" | "sent" | "resolved" | "rejected";

type RecoveryRequestItem = {
  id: string;
  account: string;
  status: RequestStatus;
  requestNote?: string | null;
  contactInfo?: string | null;
  recoveryEmailSnapshot?: string | null;
  adminNote?: string | null;
  handledAt?: string | null;
  lastSentAt?: string | null;
  createdAt: string;
  member?: {
    id: string;
    email: string;
    name?: string | null;
    recoveryEmail?: string | null;
    role?: string | null;
    memberType: string;
    enterprise?: {
      id: string;
      companyName?: string | null;
      companyShortName?: string | null;
      brand?: {
        id: string;
        name: string;
        slug: string;
      } | null;
    } | null;
  } | null;
  handledBy?: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
};

const STATUS_OPTIONS: Array<{ value: "" | RequestStatus; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "sent", label: "已发送重置" },
  { value: "resolved", label: "已完成" },
  { value: "rejected", label: "已驳回" },
];

export default function AdminPasswordRecoveryRequestsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<RecoveryRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | RequestStatus>("pending");
  const [recoveryEmailDraft, setRecoveryEmailDraft] = useState<Record<string, string>>({});
  const [adminNoteDraft, setAdminNoteDraft] = useState<Record<string, string>>({});
  const [debugResetUrls, setDebugResetUrls] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const meRes = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (!meRes.ok) {
      setRole(null);
      setLoading(false);
      return;
    }

    const me = await meRes.json();
    setRole(me.role ?? null);
    if (me.role !== "SUPER_ADMIN" && me.role !== "ADMIN") {
      setLoading(false);
      return;
    }

    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("limit", String(PAGE_SIZE));
    if (statusFilter) sp.set("status", statusFilter);
    if (keyword.trim()) sp.set("q", keyword.trim());
    const res = await fetch(`/api/admin/password-recovery-requests?${sp.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    const nextItems = Array.isArray(data.items) ? data.items : [];
    setItems(nextItems);
    setTotal(typeof data.total === "number" ? data.total : 0);
    setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
    if (typeof data.page === "number" && data.page !== page) setPage(data.page);
    setRecoveryEmailDraft(
      Object.fromEntries(
        nextItems.map((item: RecoveryRequestItem) => [item.id, item.member?.recoveryEmail ?? item.recoveryEmailSnapshot ?? ""])
      )
    );
    setAdminNoteDraft(
      Object.fromEntries(nextItems.map((item: RecoveryRequestItem) => [item.id, item.adminNote ?? ""]))
    );
    setLoading(false);
  }, [keyword, page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === "pending" || item.status === "processing").length,
    [items]
  );

  async function act(id: string, action: "save" | "send_reset" | "resolve" | "reject") {
    setSavingId(id);
    setMessage("");
    const res = await fetch(`/api/admin/password-recovery-requests/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        recoveryEmail: recoveryEmailDraft[id] ?? "",
        adminNote: adminNoteDraft[id] ?? "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "处理失败");
      setSavingId(null);
      return;
    }

    if (typeof data.debugResetUrl === "string" && data.debugResetUrl.trim()) {
      setDebugResetUrls((prev) => ({ ...prev, [id]: data.debugResetUrl.trim() }));
    }

    setMessage(
      action === "save"
        ? "找回邮箱和备注已保存"
        : action === "send_reset"
          ? "已发送重置链接"
          : action === "resolve"
            ? "申请已标记为完成"
            : "申请已驳回"
    );
    await load();
    setSavingId(null);
  }

  if (loading) return <p className="text-muted">加载中...</p>;
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") return <p className="text-muted">仅管理员可访问。</p>;

  return (
    <div className="max-w-6xl space-y-6">
      <InlinePageBackLink href="/membership/admin" label="返回后台首页" />

      <header className="rounded-xl border border-border bg-surface-elevated p-5">
        <h1 className="font-serif text-2xl font-bold text-primary">密码找回申请</h1>
        <p className="mt-1 text-sm text-muted">
          会员未绑定找回邮箱时，可在前台提交兜底申请。当前待跟进：{pendingCount}
        </p>
        {message ? <p className="mt-2 text-sm text-accent">{message}</p> : null}
      </header>

      <section className="rounded-xl border border-border bg-surface-elevated p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setKeyword(searchDraft.trim());
          }}
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto_auto] md:items-end"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">搜索账号 / 企业 / 品牌</span>
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="输入账号、企业名或品牌名"
              className="rounded border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">状态</span>
            <select
              value={statusFilter}
              onChange={(e) => { setPage(1); setStatusFilter(e.target.value as "" | RequestStatus); }}
              className="rounded border border-border bg-surface px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded bg-accent px-4 py-2 text-sm text-white">
            搜索
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchDraft("");
              setKeyword("");
              setStatusFilter("pending");
              setPage(1);
            }}
            className="rounded border border-border bg-white px-4 py-2 text-sm text-primary"
          >
            重置
          </button>
        </form>
      </section>

      <section className="space-y-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-elevated p-5 text-sm text-muted">
            当前没有找回申请。
          </div>
        ) : (
          items.map((item) => {
            const enterpriseName =
              item.member?.enterprise?.companyShortName || item.member?.enterprise?.companyName || "";
            const brandName = item.member?.enterprise?.brand?.name || "";
            return (
              <article key={item.id} className="rounded-xl border border-border bg-surface-elevated p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-primary">{item.account}</h2>
                      <span className="rounded-full bg-[rgba(191,164,118,0.14)] px-2.5 py-1 text-xs text-accent">
                        {STATUS_OPTIONS.find((option) => option.value === item.status)?.label ?? item.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      提交时间：{new Date(item.createdAt).toLocaleString("zh-CN")}
                      {item.member?.role ? ` · 角色：${item.member.role}` : ""}
                      {item.member?.memberType ? ` · 类型：${item.member.memberType}` : ""}
                    </p>
                    {enterpriseName || brandName ? (
                      <p className="text-sm text-muted">
                        {enterpriseName || "未绑定企业"}
                        {brandName ? ` / ${brandName}` : ""}
                      </p>
                    ) : null}
                    {item.member?.enterprise?.id ? (
                      <Link
                        href={`/enterprise/${item.member.enterprise.id}`}
                        className="text-sm text-accent hover:underline"
                      >
                        查看企业页
                      </Link>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted">
                    <p>当前找回邮箱：{item.member?.recoveryEmail || item.recoveryEmailSnapshot || "未设置"}</p>
                    <p>联系方式：{item.contactInfo || "未填写"}</p>
                    <p>处理人：{item.handledBy?.name || item.handledBy?.email || "未处理"}</p>
                  </div>
                </div>

                {item.requestNote ? (
                  <div className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-sm text-primary">
                    <span className="text-xs text-muted">会员说明</span>
                    <p className="mt-1 whitespace-pre-wrap">{item.requestNote}</p>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">找回邮箱</span>
                    <input
                      type="email"
                      value={recoveryEmailDraft[item.id] ?? ""}
                      onChange={(e) =>
                        setRecoveryEmailDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder="先补邮箱，再发送重置链接"
                      className="rounded border border-border bg-surface px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">管理员备注</span>
                    <textarea
                      value={adminNoteDraft[item.id] ?? ""}
                      onChange={(e) => setAdminNoteDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      rows={3}
                      placeholder="记录核验情况、处理说明或回访结果"
                      className="rounded border border-border bg-surface px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                {debugResetUrls[item.id] ? (
                  <p className="mt-3 break-all text-xs text-muted">
                    开发环境重置链接：
                    <a href={debugResetUrls[item.id]} className="ml-1 text-accent hover:underline">
                      {debugResetUrls[item.id]}
                    </a>
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={savingId === item.id}
                    onClick={() => void act(item.id, "save")}
                    className="rounded border border-border bg-white px-4 py-2 text-sm text-primary"
                  >
                    保存邮箱/备注
                  </button>
                  <button
                    type="button"
                    disabled={savingId === item.id}
                    onClick={() => void act(item.id, "send_reset")}
                    className="rounded bg-accent px-4 py-2 text-sm text-white"
                  >
                    发送重置链接
                  </button>
                  <button
                    type="button"
                    disabled={savingId === item.id}
                    onClick={() => void act(item.id, "resolve")}
                    className="rounded border border-border bg-white px-4 py-2 text-sm text-primary"
                  >
                    标记已完成
                  </button>
                  <button
                    type="button"
                    disabled={savingId === item.id}
                    onClick={() => void act(item.id, "reject")}
                    className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600"
                  >
                    驳回申请
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
      <AdminPagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} currentCount={items.length} loading={loading} onPageChange={setPage} />
    </div>
  );
}
