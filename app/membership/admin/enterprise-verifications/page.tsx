"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VerificationCard } from "@/app/membership/admin/enterprise-verifications/components/VerificationCard";
import { VerificationFilters } from "@/app/membership/admin/enterprise-verifications/components/VerificationFilters";
import { InlinePageBackLink } from "@/components/InlinePageBackLink";
import { AdminPagination } from "@/components/admin/AdminPagination";

const PAGE_SIZE = 20;

type Status = "pending" | "approved" | "rejected";

type VerificationItem = {
  id: string;
  companyName: string;
  companyShortName?: string | null;
  contactPerson: string;
  contactPhone: string;
  contactEmail?: string | null;
  logoUrl?: string | null;
  licenseImageUrl: string;
  licenseCode: string;
  address: string;
  website?: string | null;
  intro?: string | null;
  businessScope?: string | null;
  productSystem?: string | null;
  coreAdvantages?: string | null;
  status: Status;
  reviewNote?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedEnterpriseId?: string | null;
  member: {
    id: string;
    email: string;
    name?: string | null;
    role?: string | null;
    memberType: string;
  };
};

export default function AdminEnterpriseVerificationPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | Status>("pending");
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
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

    const sp = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (statusFilter) sp.set("status", statusFilter);
    const res = await fetch(`/api/admin/enterprise-verifications?${sp.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    setItems(Array.isArray(data.items) ? data.items : []);
    setTotal(typeof data.total === "number" ? data.total : 0);
    setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
    if (typeof data.page === "number" && data.page !== page) setPage(data.page);
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(() => items.filter((item) => item.status === "pending").length, [items]);

  async function review(id: string, action: "approve" | "reject") {
    setSavingId(id);
    const res = await fetch(`/api/admin/enterprise-verifications/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        reviewNote: reviewNote[id] ?? "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "审核失败");
      setSavingId(null);
      return;
    }
    setMessage(action === "approve" ? "审核通过并已生成企业页。" : "认证申请已驳回。");
    await load();
    setSavingId(null);
  }

  if (loading) return <p className="text-muted">加载中...</p>;
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") return <p className="text-muted">仅管理员可访问。</p>;

  return (
    <div className="max-w-6xl space-y-6">
      <InlinePageBackLink href="/membership/admin" label="返回后台首页" />
      <header className="rounded-xl border border-border bg-surface-elevated p-5">
        <h1 className="font-serif text-2xl font-bold text-primary">企业认证审核</h1>
        <p className="mt-1 text-sm text-muted">待审核数量：{pendingCount}</p>
        {message ? <p className="mt-2 text-sm text-accent">{message}</p> : null}
      </header>

      <VerificationFilters statusFilter={statusFilter} onChange={(value) => { setPage(1); setStatusFilter(value); }} />

      <section className="space-y-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-elevated p-5 text-sm text-muted">暂无认证申请</div>
        ) : (
          items.map((item) => (
            <VerificationCard
              key={item.id}
              item={item}
              reviewText={reviewNote[item.id] ?? ""}
              saving={savingId === item.id}
              onReviewTextChange={(value) => setReviewNote((prev) => ({ ...prev, [item.id]: value }))}
              onReview={(action) => void review(item.id, action)}
            />
          ))
        )}
      </section>
      <AdminPagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} currentCount={items.length} loading={loading} onPageChange={setPage} />
    </div>
  );
}
