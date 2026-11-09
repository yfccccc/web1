"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  isRecommend: boolean;
  isBrandVisible: boolean;
  sortOrder: number;
  rankingWeight: number;
  frontDisplay: {
    name: string;
    logoUrl: string | null;
    region: string;
    area: string | null;
    summary: string;
    detailHref: string;
  };
  qualityFlags: {
    missingLogo: boolean;
    missingSummary: boolean;
    missingContact: boolean;
    weakIntro?: boolean;
    suspiciousIntro?: boolean;
  };
  enterprise: {
    id: string;
    memberId: string;
    companyName: string | null;
    companyShortName: string | null;
    member?: {
      memberType: string;
      rankingWeight: number;
    } | null;
  } | null;
};

type ApiResponse = {
  items: BrandRow[];
  total: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  stats?: {
    totalBrands?: number;
    visibleTotal?: number;
    recommendedTotal?: number;
    needsAttentionTotal?: number;
  };
};

const PAGE_SIZE = 20;

function issueLabels(item: BrandRow) {
  return [
    item.qualityFlags.missingLogo ? "缺 Logo" : null,
    item.qualityFlags.missingSummary ? "缺摘要" : null,
    item.qualityFlags.missingContact ? "缺联系" : null,
    item.qualityFlags.weakIntro ? "简介过短" : null,
    item.qualityFlags.suspiciousIntro ? "内容待清洗" : null,
  ].filter(Boolean) as string[];
}

function memberTypeLabel(item: BrandRow) {
  const memberType = item.enterprise?.member?.memberType || "enterprise_basic";
  if (memberType === "enterprise_advanced") return "VIP 企业";
  if (memberType === "enterprise_basic") return "企业会员";
  return memberType;
}

function applyStatsDelta(
  current: { totalBrands: number; visibleTotal: number; recommendedTotal: number; needsAttentionTotal: number },
  patch: Partial<Pick<BrandRow, "isBrandVisible" | "isRecommend">>,
  options: { visibleChanged?: number; recommendedChanged?: number } = {},
) {
  return {
    ...current,
    visibleTotal: current.visibleTotal + (options.visibleChanged ?? 0),
    recommendedTotal: current.recommendedTotal + (options.recommendedChanged ?? 0),
  };
}

export default function AdminBrandsPage() {
  const [items, setItems] = useState<BrandRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState("");
  const [qualityFilter, setQualityFilter] = useState("needs_attention");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalBrands: 0,
    visibleTotal: 0,
    recommendedTotal: 0,
    needsAttentionTotal: 0,
  });
  const selectedCount = selectedBrandIds.length;

  const load = useCallback(async (search = "", quality = "needs_attention", nextPage = 1) => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(nextPage) });
    if (search.trim()) params.set("q", search.trim());
    if (quality && quality !== "all") params.set("quality", quality);

    const res = await fetch(`/api/admin/brands?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Partial<ApiResponse> & { error?: string };
    if (!res.ok) {
      setItems([]);
      setTotal(0);
      setPage(1);
      setPageInput("1");
      setTotalPages(1);
      setStats({ totalBrands: 0, visibleTotal: 0, recommendedTotal: 0, needsAttentionTotal: 0 });
      setMessage(data.error ?? "品牌列表加载失败");
      setLoading(false);
      return;
    }

    const nextItems = Array.isArray(data.items) ? data.items : [];
    const currentPage = typeof data.page === "number" ? data.page : nextPage;
    const computedTotalPages =
      typeof data.totalPages === "number"
        ? data.totalPages
        : Math.max(1, Math.ceil((typeof data.total === "number" ? data.total : nextItems.length) / PAGE_SIZE));

    setItems(nextItems);
    setTotal(typeof data.total === "number" ? data.total : nextItems.length);
    setPage(currentPage);
    setPageInput(String(currentPage));
    setTotalPages(computedTotalPages);
    setStats({
      totalBrands: typeof data.stats?.totalBrands === "number" ? data.stats.totalBrands : 0,
      visibleTotal: typeof data.stats?.visibleTotal === "number" ? data.stats.visibleTotal : 0,
      recommendedTotal: typeof data.stats?.recommendedTotal === "number" ? data.stats.recommendedTotal : 0,
      needsAttentionTotal: typeof data.stats?.needsAttentionTotal === "number" ? data.stats.needsAttentionTotal : 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load("", "needs_attention", 1);
  }, [load]);

  const currentPageVisibleCount = useMemo(() => items.filter((item) => item.isBrandVisible).length, [items]);
  const currentPageSelectedCount = useMemo(
    () => items.filter((item) => selectedBrandIds.includes(item.id)).length,
    [items, selectedBrandIds],
  );

  async function updateBrand(id: string, patch: Partial<BrandRow>) {
    const currentItem = items.find((item) => item.id === id) ?? null;
    setSavingId(id);
    setMessage("");
    const res = await fetch(`/api/admin/brands/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<BrandRow> & { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "品牌设置更新失败");
      setSavingId(null);
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === id ? ({ ...item, ...data } as BrandRow) : item)));
    setStats((prev) =>
      applyStatsDelta(
        prev,
        patch,
        {
          visibleChanged:
            typeof patch.isBrandVisible === "boolean" && currentItem && currentItem.isBrandVisible !== patch.isBrandVisible
              ? patch.isBrandVisible
                ? 1
                : -1
              : 0,
          recommendedChanged:
            typeof patch.isRecommend === "boolean" && currentItem && currentItem.isRecommend !== patch.isRecommend
              ? patch.isRecommend
                ? 1
                : -1
              : 0,
        },
      ),
    );
    setSavingId(null);
  }

  async function runBatchAction(
    patch: Pick<BrandRow, "isBrandVisible"> | Pick<BrandRow, "isRecommend">,
    scope: "selected" | "page" | "filter",
    successMessage: string,
  ) {
    if (scope === "selected" && selectedBrandIds.length === 0) return;
    if (scope === "page" && items.length === 0) return;
    setBatchSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/brands/batch", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: scope === "filter" ? "filter" : "page",
        ids: scope === "selected" ? selectedBrandIds : scope === "page" ? items.map((item) => item.id) : [],
        filters: {
          q,
          quality: qualityFilter !== "all" ? qualityFilter : undefined,
        },
        patch,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; count?: number };
    if (!res.ok) {
      setMessage(data.error ?? "批量操作失败");
      setBatchSaving(false);
      return;
    }

    if (scope === "selected" || scope === "page") {
      const targetIds = scope === "selected" ? new Set(selectedBrandIds) : new Set(items.map((item) => item.id));
      const targetItems = items.filter((item) => targetIds.has(item.id));
      const visibleChanged =
        "isBrandVisible" in patch
          ? patch.isBrandVisible
            ? targetItems.filter((item) => !item.isBrandVisible).length
            : -targetItems.filter((item) => item.isBrandVisible).length
          : 0;
      const recommendedChanged =
        "isRecommend" in patch
          ? patch.isRecommend
            ? targetItems.filter((item) => !item.isRecommend).length
            : -targetItems.filter((item) => item.isRecommend).length
          : 0;

      setItems((prev) => prev.map((item) => (targetIds.has(item.id) ? { ...item, ...patch } : item)));
      setStats((prev) => applyStatsDelta(prev, patch, { visibleChanged, recommendedChanged }));
    } else {
      await load(q, qualityFilter, page);
    }

    if (scope === "selected") {
      setSelectedBrandIds([]);
    }
    setMessage(`${successMessage}${typeof data.count === "number" ? ` 本次处理 ${data.count} 家。` : ""}`);
    setBatchSaving(false);
  }

  function toggleSelectedBrand(id: string) {
    setSelectedBrandIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectCurrentPage() {
    const currentIds = items.map((item) => item.id);
    const allSelected = currentIds.every((id) => selectedBrandIds.includes(id));
    setSelectedBrandIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !currentIds.includes(id));
      }
      return Array.from(new Set([...prev, ...currentIds]));
    });
  }

  function jumpToPage() {
    const parsed = Number.parseInt(pageInput.trim(), 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(page));
      return;
    }
    const safePage = Math.min(Math.max(parsed, 1), totalPages);
    void load(q, qualityFilter, safePage);
  }

  return (
    <div className="space-y-6">
      <header className="rounded-[28px] border border-[rgba(181,157,121,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,242,235,0.92))] p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <p className="text-xs uppercase tracking-[0.3em] text-[#9d7e4d]">Brand Management</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-primary">品牌管理</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-muted">
              这里用于统一管理前台品牌展示。管理员先在列表里判断哪些企业需要前台显示，再进入详情页维护 Logo、简介、联系方式和展示资料。
            </p>
          </div>
          <Link
            href="/membership/admin/brands/create"
            className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            创建品牌
          </Link>
          <div className="grid min-w-[300px] grid-cols-3 gap-3 text-center text-sm">
            <StatCard label="品牌总数" value={String(stats.totalBrands)} />
            <StatCard label="前台显示" value={String(stats.visibleTotal)} />
            <StatCard label="待完善" value={String(stats.needsAttentionTotal)} tone={stats.needsAttentionTotal > 0 ? "accent" : "normal"} />
          </div>
        </div>
        {message ? <p className="mt-4 text-sm text-accent">{message}</p> : null}
      </header>

      <section className="rounded-[24px] border border-[rgba(181,157,121,0.16)] bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)] sm:p-5">
        <form
          className="grid gap-3 lg:grid-cols-[1fr,auto,auto,auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void load(q, qualityFilter, 1);
          }}
        >
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="h-12 rounded-[16px] border border-border bg-surface px-4 text-sm text-primary"
            placeholder="搜索企业名、品牌名、地区、产品体系"
          />
          <select
            value={qualityFilter}
            onChange={(event) => setQualityFilter(event.target.value)}
            className="h-12 rounded-[16px] border border-border bg-surface px-4 text-sm text-primary"
          >
            <option value="needs_attention">待完善资料</option>
            <option value="missing_logo">缺 Logo</option>
            <option value="missing_summary">缺摘要</option>
            <option value="missing_contact">缺联系</option>
            <option value="intro_short">简介过短</option>
            <option value="intro_dirty">内容待清洗</option>
            <option value="all">全部品牌</option>
          </select>
          <button className="h-12 rounded-[16px] bg-accent px-5 text-sm font-medium text-white">搜索</button>
          <button
            type="button"
            className="h-12 rounded-[16px] border border-border px-5 text-sm text-primary transition hover:bg-surface"
            onClick={() => {
              setQ("");
              setQualityFilter("needs_attention");
              void load("", "needs_attention", 1);
            }}
          >
            重置
          </button>
        </form>
        <p className="mt-3 text-xs text-muted">
          后台列表每页展示 20 家，排序优先级为：前台显示中的企业优先、推荐品牌优先、人工排序值优先、会员权重优先。支持按缺 Logo、缺摘要、缺联系、简介过短、内容待清洗筛查；下面“本页”按钮只作用当前 20 条，要批量处理全部筛选结果请用“当前筛选结果”按钮。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={batchSaving || loading || items.length === 0}
            onClick={toggleSelectCurrentPage}
            className="rounded-full border border-border px-4 py-2 text-sm text-primary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {currentPageSelectedCount === items.length && items.length > 0 ? "取消本页全选" : "本页全选"}
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || selectedCount === 0}
            onClick={() => void runBatchAction({ isBrandVisible: true }, "selected", "已选品牌已设为前台显示。")}
            className="rounded-full border border-[rgba(181,157,121,0.24)] bg-[rgba(255,249,238,0.92)] px-4 py-2 text-sm text-accent transition hover:bg-[rgba(255,244,227,0.95)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            设为显示（已选 {selectedCount}）
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || selectedCount === 0}
            onClick={() => void runBatchAction({ isBrandVisible: false }, "selected", "已选品牌已隐藏。")}
            className="rounded-full border border-[rgba(181,157,121,0.24)] bg-[rgba(255,249,238,0.92)] px-4 py-2 text-sm text-accent transition hover:bg-[rgba(255,244,227,0.95)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            设为隐藏（已选 {selectedCount}）
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || selectedCount === 0}
            onClick={() => void runBatchAction({ isRecommend: true }, "selected", "已选品牌已设为推荐。")}
            className="rounded-full border border-[rgba(181,157,121,0.24)] bg-[rgba(255,249,238,0.92)] px-4 py-2 text-sm text-accent transition hover:bg-[rgba(255,244,227,0.95)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            设为推荐（已选 {selectedCount}）
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || items.length === 0}
            onClick={() => void runBatchAction({ isBrandVisible: true }, "page", "本页品牌已一键设为前台显示。")}
            className="rounded-full border border-border px-4 py-2 text-sm text-primary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            本页一键显示
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || items.length === 0}
            onClick={() => void runBatchAction({ isBrandVisible: false }, "page", "本页品牌已一键隐藏。")}
            className="rounded-full border border-border px-4 py-2 text-sm text-primary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            本页一键隐藏
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || items.length === 0}
            onClick={() => void runBatchAction({ isRecommend: true }, "page", "本页品牌已一键设为推荐。")}
            className="rounded-full border border-border px-4 py-2 text-sm text-primary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            本页一键推荐
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || items.length === 0}
            onClick={() => void runBatchAction({ isRecommend: false }, "page", "本页品牌已一键取消推荐。")}
            className="rounded-full border border-border px-4 py-2 text-sm text-primary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            本页取消推荐
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || total === 0}
            onClick={() => void runBatchAction({ isBrandVisible: false }, "filter", "当前筛选结果已一键隐藏。")}
            className="rounded-full border border-[rgba(181,157,121,0.24)] bg-[rgba(255,249,238,0.92)] px-4 py-2 text-sm text-accent transition hover:bg-[rgba(255,244,227,0.95)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            当前筛选结果一键隐藏
          </button>
          <button
            type="button"
            disabled={batchSaving || loading || total === 0}
            onClick={() => void runBatchAction({ isBrandVisible: true }, "filter", "当前筛选结果已一键设为前台显示。")}
            className="rounded-full border border-[rgba(181,157,121,0.24)] bg-[rgba(255,249,238,0.92)] px-4 py-2 text-sm text-accent transition hover:bg-[rgba(255,244,227,0.95)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            当前筛选结果一键显示
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[rgba(181,157,121,0.16)] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <div className="hidden border-b border-border px-5 py-3 text-[11px] uppercase tracking-[0.16em] text-muted lg:grid lg:grid-cols-[72px_56px_minmax(0,1.7fr)_116px_112px_148px_108px_132px] lg:gap-3">
          <span>选择</span>
          <span>序号</span>
          <span>企业 / 品牌</span>
          <span>会员类型</span>
          <span>前台显示</span>
          <span>资料状态</span>
          <span>推荐</span>
          <span>操作</span>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-muted">加载品牌列表中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-sm text-muted">当前没有匹配的品牌数据。</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item, index) => {
              const issues = issueLabels(item);
              const disabled = savingId === item.id;
              const rowNumber = (page - 1) * PAGE_SIZE + index + 1;
              return (
                <article
                  key={item.id}
                  className={`px-5 py-3 transition ${
                    selectedBrandIds.includes(item.id) ? "bg-[rgba(255,249,238,0.78)]" : ""
                  }`}
                >
                  <div className="grid gap-3 lg:grid-cols-[72px_56px_minmax(0,1.7fr)_116px_112px_148px_108px_132px] lg:items-center">
                    <div>
                      <button
                        type="button"
                        aria-label={item.enterprise ? `选中 ${item.frontDisplay.name}` : `选中 ${item.name}`}
                        title={item.enterprise ? "选中企业" : "选中品牌"}
                        onClick={() => toggleSelectedBrand(item.id)}
                        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-[12px] border transition ${
                          selectedBrandIds.includes(item.id)
                            ? "border-accent bg-[rgba(186,158,108,0.12)] shadow-[0_10px_24px_rgba(180,154,107,0.14)]"
                            : "border-border bg-white hover:border-accent/40 hover:bg-surface"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded-[4px] border text-[11px] leading-none transition ${
                            selectedBrandIds.includes(item.id)
                              ? "border-accent bg-accent text-white"
                              : "border-[rgba(148,163,184,0.6)] bg-white text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    </div>
                    <div className="text-sm font-medium text-muted">{rowNumber}</div>
                    <div className="min-w-0">
                      <Link
                        href={item.frontDisplay.detailHref}
                        target="_blank"
                        className={`truncate text-[15px] font-medium leading-6 transition hover:text-accent hover:underline ${
                          selectedBrandIds.includes(item.id) ? "text-accent" : "text-primary"
                        }`}
                      >
                        {item.frontDisplay.name}
                      </Link>
                    </div>

                    <div className="text-sm text-primary">{memberTypeLabel(item)}</div>

                    <div>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void updateBrand(item.id, { isBrandVisible: !item.isBrandVisible })}
                        className={`rounded-full px-3 py-1 text-sm transition ${item.isBrandVisible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        {item.isBrandVisible ? "显示中" : "已隐藏"}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {issues.length > 0 ? (
                        issues.map((label) => (
                            <span key={label} className="rounded-full border border-[rgba(181,157,121,0.18)] bg-[rgba(255,249,238,0.92)] px-2.5 py-0.5 text-xs text-accent">
                              {label}
                            </span>
                          ))
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">完整</span>
                      )}
                    </div>

                    <div>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void updateBrand(item.id, { isRecommend: !item.isRecommend })}
                        className={`rounded-full px-3 py-1 text-sm transition ${item.isRecommend ? "bg-[rgba(245,236,220,0.85)] text-accent" : "bg-slate-100 text-slate-600"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        {item.isRecommend ? "推荐中" : "普通"}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      <Link href={`/membership/admin/brands/${item.id}`} className="text-accent hover:underline">
                        {item.enterprise ? "管理详情" : "选择企业"}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="space-y-3 text-sm text-muted">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>当前第 {page} / {totalPages} 页，本页前台显示 {currentPageVisibleCount} 家。</span>
          <span>已选择 {selectedCount} 家，推荐品牌共 {stats.recommendedTotal} 家。</span>
        </div>
        <AdminPagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} currentCount={items.length} loading={loading} onPageChange={(nextPage) => void load(q, qualityFilter, nextPage)} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2">
            <span>跳到第</span>
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  jumpToPage();
                }
              }}
              className="h-10 w-20 rounded-[14px] border border-border bg-surface px-3 text-center text-sm text-primary"
            />
            <span>页</span>
            <button
              type="button"
              disabled={loading}
              onClick={jumpToPage}
              className="rounded-full border border-border px-4 py-2 text-primary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              跳转
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "accent" }) {
  return (
    <div className={`rounded-[20px] border px-3 py-3 ${tone === "accent" ? "border-[rgba(181,157,121,0.2)] bg-[rgba(255,249,238,0.92)]" : "border-border bg-white"}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold text-primary">{value}</p>
    </div>
  );
}
