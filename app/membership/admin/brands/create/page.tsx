"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EnterpriseOption = {
  id: string;
  companyName: string | null;
  companyShortName: string | null;
  member: {
    email: string;
    name: string | null;
    memberType: string;
  };
};

type EnterpriseApiItem = EnterpriseOption & {
  brand: { id: string; name: string } | null;
};

function memberTypeLabel(value: string) {
  if (value === "enterprise_advanced") return "VIP 企业";
  if (value === "enterprise_basic") return "基础企业";
  return value;
}

export default function AdminBrandCreatePage() {
  const [mode, setMode] = useState<"enterprise" | "standalone">("enterprise");
  const [items, setItems] = useState<EnterpriseApiItem[]>([]);
  const [enterpriseKeyword, setEnterpriseKeyword] = useState("");
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [tagline, setTagline] = useState("");
  const [region, setRegion] = useState("");
  const [positioning, setPositioning] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/enterprises?limit=500&brandBinding=unbound", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data.items) ? data.items : []);
    })();
  }, []);

  const filteredEnterprises = useMemo(() => {
    const keyword = enterpriseKeyword.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      [item.companyShortName, item.companyName, item.member.name, item.member.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [enterpriseKeyword, items]);

  async function createFromEnterprise() {
    if (!selectedEnterpriseId) {
      setMessage("请先选择企业");
      return;
    }

    setSaving(true);
    setMessage("");

    const res = await fetch(`/api/admin/enterprises/${selectedEnterpriseId}/brand`, {
      method: "POST",
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; brandId?: string; message?: string };

    if (!res.ok) {
      setMessage(data.error ?? "创建品牌失败");
      setSaving(false);
      return;
    }

    if (data.brandId) {
      window.location.href = `/membership/admin/brands/${data.brandId}`;
      return;
    }

    setSaving(false);
  }

  async function createStandalone() {
    if (!name.trim()) {
      setMessage("品牌名称必填");
      return;
    }

    setSaving(true);
    setMessage("");

    const res = await fetch("/api/admin/brands", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug: slug.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        tagline: tagline.trim() || undefined,
        region: region.trim() || undefined,
        positioning: positioning.trim() || undefined,
        enterpriseId: null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };

    if (!res.ok) {
      setMessage(data.error ?? "创建品牌失败");
      setSaving(false);
      return;
    }

    if (data.id) {
      window.location.href = `/membership/admin/brands/${data.id}`;
      return;
    }

    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <header className="rounded-[28px] border border-[rgba(181,157,121,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,242,235,0.92))] p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#9d7e4d]">Brand Create</p>
            <h1 className="mt-3 font-serif text-3xl text-primary">创建品牌</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              推荐优先从企业创建品牌，这样可以直接继承企业资料并避免重复；如果确实没有企业主体，再创建独立品牌。
            </p>
          </div>
          <Link href="/membership/admin/brands" className="rounded-full border border-border px-4 py-2 text-primary transition hover:bg-surface">
            返回品牌管理
          </Link>
        </div>
        {message ? <p className="mt-4 text-sm text-accent">{message}</p> : null}
      </header>

      <section className="rounded-[24px] border border-[rgba(181,157,121,0.16)] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode("enterprise")}
            className={`rounded-full px-4 py-2 text-sm ${mode === "enterprise" ? "bg-accent text-white" : "border border-border text-primary"}`}
          >
            从企业创建
          </button>
          <button
            type="button"
            onClick={() => setMode("standalone")}
            className={`rounded-full px-4 py-2 text-sm ${mode === "standalone" ? "bg-accent text-white" : "border border-border text-primary"}`}
          >
            独立品牌
          </button>
        </div>
      </section>

      {mode === "enterprise" ? (
        <section className="rounded-[28px] border border-[rgba(181,157,121,0.16)] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <label className="block text-sm font-medium text-primary">搜索企业</label>
          <input
            value={enterpriseKeyword}
            onChange={(event) => setEnterpriseKeyword(event.target.value)}
            className="mt-2 h-11 w-full rounded-[16px] border border-border bg-surface px-4 text-sm text-primary"
            placeholder="输入企业名称、简称、账号"
          />
          <div className="mt-4 max-h-[360px] overflow-y-auto rounded-[20px] border border-border">
            {filteredEnterprises.map((item) => {
              const label = item.companyShortName || item.companyName || item.member.name || item.member.email;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedEnterpriseId(item.id)}
                  className={`flex w-full items-start justify-between gap-4 border-b border-border px-4 py-3 text-left last:border-b-0 ${
                    selectedEnterpriseId === item.id ? "bg-[rgba(180,154,107,0.12)]" : "bg-white hover:bg-surface"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-medium text-primary">{label}</span>
                    <span className="mt-1 block text-xs text-muted">
                      {item.companyName && item.companyName !== item.companyShortName ? `${item.companyName} / ` : ""}
                      {item.member.email}
                    </span>
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{memberTypeLabel(item.member.memberType)}</span>
                </button>
              );
            })}
            {filteredEnterprises.length === 0 ? <div className="px-4 py-6 text-sm text-muted">暂无可选企业。</div> : null}
          </div>
          <div className="mt-5">
            <button
              type="button"
              disabled={saving || !selectedEnterpriseId}
              onClick={() => void createFromEnterprise()}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "创建中..." : "创建品牌并绑定"}
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-[rgba(181,157,121,0.16)] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="品牌名称"><input value={name} onChange={(event) => setName(event.target.value)} className="h-11 w-full rounded-[16px] border border-border bg-surface px-4 text-sm text-primary" /></Field>
            <Field label="slug"><input value={slug} onChange={(event) => setSlug(event.target.value)} className="h-11 w-full rounded-[16px] border border-border bg-surface px-4 text-sm text-primary" /></Field>
            <Field label="Logo URL"><input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} className="h-11 w-full rounded-[16px] border border-border bg-surface px-4 text-sm text-primary" /></Field>
            <Field label="地区"><input value={region} onChange={(event) => setRegion(event.target.value)} className="h-11 w-full rounded-[16px] border border-border bg-surface px-4 text-sm text-primary" /></Field>
            <Field label="简介" className="md:col-span-2"><input value={tagline} onChange={(event) => setTagline(event.target.value)} className="h-11 w-full rounded-[16px] border border-border bg-surface px-4 text-sm text-primary" /></Field>
            <Field label="品牌定位" className="md:col-span-2"><input value={positioning} onChange={(event) => setPositioning(event.target.value)} className="h-11 w-full rounded-[16px] border border-border bg-surface px-4 text-sm text-primary" /></Field>
          </div>
          <div className="mt-5">
            <button
              type="button"
              disabled={saving}
              onClick={() => void createStandalone()}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "创建中..." : "创建独立品牌"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-primary">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
