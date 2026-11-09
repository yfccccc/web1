"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { InlinePageBackLink } from "@/components/InlinePageBackLink";
import { MEMBER_PUBLISH_CATEGORY_OPTIONS } from "@/lib/content-taxonomy";

type MemberSummary = {
  id: string;
  account: string;
  name: string | null;
  role: string | null;
  memberType: string;
  createdAt: string;
};

type GrantSettings = {
  year: number;
  activeFrom: string | null;
  activeUntil: string | null;
  features: Record<string, boolean | null>;
  categories: Record<
    string,
    {
      enabled: boolean | null;
      annualLimit: number | null;
      subcategories: Record<string, { enabled: boolean | null; annualLimit: number | null }>;
    }
  >;
};

type Rule = {
  label: string;
  newsPublishLimit: number | null;
  galleryUploadLimit: number | null;
};

const FEATURE_ITEMS: Array<[string, string]> = [
  ["enterpriseSite", "企业站"],
  ["seo", "SEO"],
  ["recommendContent", "推荐内容"],
  ["galleryUpload", "图库上传"],
  ["standardFeedback", "标准反馈"],
  ["dictionaryContribution", "词库共建"],
  ["standardCoBuild", "标准共建"],
  ["subAccounts", "子账号"],
];

export default function AdminMemberGrantsPage() {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [grants, setGrants] = useState<GrantSettings | null>(null);
  const [defaultRule, setDefaultRule] = useState<Rule | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLElement | null>(null);
  const shouldScrollToResultsRef = useRef(false);
  const shouldScrollToEditorRef = useRef(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/members?limit=500", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data.items) ? data.items : [];
      setMembers(rows);
      if (rows[0]?.id) setSelectedId(rows[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const res = await fetch(`/api/admin/member-grants/${selectedId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "读取授权失败");
        return;
      }
      const nextGrants = data.grants ?? null;
      setGrants(nextGrants);
      setDefaultRule(data.defaultRule ?? null);
      setSavedSnapshot(nextGrants ? JSON.stringify(nextGrants) : "");
      setLastSavedAt(null);
      setMessage("");
    })();
  }, [selectedId]);

  const selectedMember = useMemo(() => members.find((item) => item.id === selectedId) ?? null, [members, selectedId]);
  const filteredMembers = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => {
      const haystack = [member.name, member.account, member.memberType, member.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [keyword, members]);
  const grantSnapshot = useMemo(() => (grants ? JSON.stringify(grants) : ""), [grants]);
  const hasUnsavedChanges = Boolean(grants) && grantSnapshot !== savedSnapshot;

  useEffect(() => {
    if (!shouldScrollToResultsRef.current) return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    shouldScrollToResultsRef.current = false;
  }, [filteredMembers.length]);

  useEffect(() => {
    if (!shouldScrollToEditorRef.current || !grants) return;
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    shouldScrollToEditorRef.current = false;
  }, [grants, selectedId]);

  function selectMember(memberId: string) {
    setSelectedId(memberId);
    shouldScrollToEditorRef.current = true;
  }

  function applyMemberSearch(event?: FormEvent) {
    event?.preventDefault();
    const nextKeyword = searchDraft.trim();
    setKeyword(nextKeyword);
    shouldScrollToResultsRef.current = true;
    const nextMembers = members.filter((member) => {
      if (!nextKeyword) return true;
      const haystack = [member.name, member.account, member.memberType, member.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(nextKeyword.toLowerCase());
    });
    if (nextMembers[0]?.id) {
      setSelectedId(nextMembers[0].id);
      shouldScrollToEditorRef.current = true;
    }
  }

  async function save() {
    if (!selectedId || !grants) return;
    setSaving(true);
    setMessage("正在保存会员授权...");
    const res = await fetch(`/api/admin/member-grants/${selectedId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(grants),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "保存失败");
      setSaving(false);
      return;
    }
    const nextGrants = data.grants ?? grants;
    setGrants(nextGrants);
    setSavedSnapshot(JSON.stringify(nextGrants));
    setLastSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setMessage("会员个体授权已保存");
    setSaving(false);
  }

  if (loading) return <div className="text-sm text-muted">加载中...</div>;

  return (
    <div className="max-w-7xl space-y-6">
      <InlinePageBackLink href="/membership/admin" label="返回后台首页" />

      <header className="rounded-2xl border border-border bg-surface-elevated p-6">
        <h1 className="font-serif text-2xl font-bold text-primary">会员授权管理</h1>
        <p className="mt-2 text-sm text-muted">
          用于覆盖会员等级默认权益，可细化到栏目、子栏目和年度数量。适合媒体客户、合作机构和特殊企业账号。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {message ? (
            <p className={`rounded-full px-3 py-1 ${message.includes("失败") ? "bg-[rgba(220,38,38,0.08)] text-red-600" : "bg-accent/10 text-accent"}`}>
              {message}
            </p>
          ) : null}
          {hasUnsavedChanges ? (
            <p className="rounded-full bg-[rgba(180,154,107,0.12)] px-3 py-1 text-primary">当前有未保存改动</p>
          ) : lastSavedAt ? (
            <p className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-muted">最近保存于 {lastSavedAt}</p>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[320px,1fr]">
        <aside className="rounded-2xl border border-border bg-surface-elevated p-4">
          <form onSubmit={applyMemberSearch} className="mb-4 rounded-xl border border-border bg-surface p-3">
            <label className="block text-sm">
              <span className="text-primary">搜索会员</span>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="输入账号、姓名、角色或会员类型"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
                搜索
              </button>
              {keyword ? (
                <button
                  type="button"
                  onClick={() => {
                    setKeyword("");
                    setSearchDraft("");
                    if (members[0]?.id) setSelectedId(members[0].id);
                  }}
                  className="rounded-lg border border-border bg-white px-4 py-2 text-sm text-primary"
                >
                  清空
                </button>
              ) : null}
            </div>
          </form>

          <div ref={resultsRef} className="mb-4 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-primary">搜索结果</p>
              <span className="text-xs text-muted">{filteredMembers.length} 位会员</span>
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => {
                  const active = member.id === selectedId;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => selectMember(member.id)}
                      className={`block w-full rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-[rgba(180,154,107,0.3)] bg-[rgba(255,249,240,0.92)]"
                          : "border-border bg-white hover:border-[rgba(180,154,107,0.22)] hover:bg-surface"
                      }`}
                    >
                      <p className="text-sm font-medium text-primary">{member.name?.trim() || member.account}</p>
                      <p className="mt-1 text-xs text-muted">{member.account} / {member.memberType}</p>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-muted">没有找到匹配会员，请换个关键词再试。</p>
              )}
            </div>
          </div>

          <label className="block text-sm">
            <span className="text-primary">选择会员</span>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={selectedId}
              onChange={(e) => selectMember(e.target.value)}
            >
              {filteredMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {(member.name?.trim() || member.account) + " / " + member.memberType}
                </option>
              ))}
            </select>
          </label>

          {selectedMember && defaultRule ? (
            <div className="mt-4 space-y-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
              <p>会员类型：{selectedMember.memberType}</p>
              <p>默认权益：{defaultRule.label}</p>
              <p>默认资讯额度：{defaultRule.newsPublishLimit == null ? "不限" : `${defaultRule.newsPublishLimit} / 年`}</p>
              <p>默认图库额度：{defaultRule.galleryUploadLimit == null ? "不限" : `${defaultRule.galleryUploadLimit} / 年`}</p>
            </div>
          ) : null}
        </aside>

        <section ref={editorRef} className="space-y-4">
          {grants ? (
            <>
              <article className="rounded-2xl border border-border bg-surface-elevated p-5">
                <div className="grid gap-4 md:grid-cols-[220px_220px_1fr]">
                  <label className="block text-sm">
                    <span className="text-primary">授权开始日期</span>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={grants.activeFrom ?? ""}
                      onChange={(e) =>
                        setGrants((prev) =>
                          prev
                            ? {
                                ...prev,
                                activeFrom: e.target.value || null,
                                year: e.target.value ? Number(e.target.value.slice(0, 4)) : prev.year,
                              }
                            : prev
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-primary">授权结束日期</span>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={grants.activeUntil ?? ""}
                      onChange={(e) =>
                        setGrants((prev) =>
                          prev ? { ...prev, activeUntil: e.target.value || null } : prev
                        )
                      }
                    />
                  </label>
                  <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
                    <p>当前统计年度：{grants.year}</p>
                    <p className="mt-1">个体授权会在所选日期区间内生效，到期后自动回落到会员等级默认权益。</p>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-border bg-surface-elevated p-5">
                <h2 className="text-lg font-semibold text-primary">功能覆盖</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {FEATURE_ITEMS.map(([key, label]) => (
                    <FeatureSelect
                      key={key}
                      label={label}
                      value={grants.features[key] ?? null}
                      onChange={(value) =>
                        setGrants((prev) =>
                          prev ? { ...prev, features: { ...prev.features, [key]: value } } : prev
                        )
                      }
                    />
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-border bg-surface-elevated p-5">
                <h2 className="text-lg font-semibold text-primary">栏目与子栏目授权</h2>
                <p className="mt-2 text-sm text-muted">
                  子栏目年额度不会自动覆盖栏目年额度。若要让某个子栏目实际可发更多内容，请同步把对应栏目年额度提升到不低于子栏目额度。
                </p>
                <div className="mt-4 space-y-4">
                  {MEMBER_PUBLISH_CATEGORY_OPTIONS.map((category) => {
                    const categoryGrant = grants.categories[category.href];
                    return (
                      <div key={category.href} className="rounded-2xl border border-border bg-surface p-4">
                        <div className="grid gap-3 md:grid-cols-[1.2fr,140px,160px]">
                          <div>
                            <p className="text-sm font-medium text-primary">{category.label}</p>
                            <p className="text-xs text-muted">{category.href}</p>
                          </div>
                          <FeatureSelect
                            label="栏目开关"
                            compact
                            value={categoryGrant?.enabled ?? null}
                            onChange={(value) =>
                              setGrants((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      categories: {
                                        ...prev.categories,
                                        [category.href]: { ...prev.categories[category.href], enabled: value },
                                      },
                                    }
                                  : prev
                              )
                            }
                          />
                          <NumberInput
                            label="栏目年额度"
                            value={categoryGrant?.annualLimit ?? null}
                            onChange={(value) =>
                              setGrants((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      categories: {
                                        ...prev.categories,
                                        [category.href]: { ...prev.categories[category.href], annualLimit: value },
                                      },
                                    }
                                  : prev
                              )
                            }
                          />
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                          {category.subs.map((sub) => {
                            const subGrant = categoryGrant?.subcategories[sub.href];
                            return (
                              <div key={sub.href} className="rounded-xl border border-border bg-surface-elevated p-3">
                                <p className="text-sm font-medium text-primary">{sub.label}</p>
                                <p className="mt-1 text-xs text-muted">{sub.href}</p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  <FeatureSelect
                                    label="子栏目开关"
                                    compact
                                    value={subGrant?.enabled ?? null}
                                    onChange={(value) =>
                                      setGrants((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              categories: {
                                                ...prev.categories,
                                                [category.href]: {
                                                  ...prev.categories[category.href],
                                                  subcategories: {
                                                    ...prev.categories[category.href].subcategories,
                                                    [sub.href]: {
                                                      ...prev.categories[category.href].subcategories[sub.href],
                                                      enabled: value,
                                                    },
                                                  },
                                                },
                                              },
                                            }
                                          : prev
                                      )
                                    }
                                  />
                                  <NumberInput
                                    label="子栏目年额度"
                                    value={subGrant?.annualLimit ?? null}
                                    onChange={(value) =>
                                      setGrants((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              categories: {
                                                ...prev.categories,
                                                [category.href]: {
                                                  ...prev.categories[category.href],
                                                  subcategories: {
                                                    ...prev.categories[category.href].subcategories,
                                                    [sub.href]: {
                                                      ...prev.categories[category.href].subcategories[sub.href],
                                                      annualLimit: value,
                                                    },
                                                  },
                                                },
                                              },
                                            }
                                          : prev
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>

              <div className="sticky bottom-4 z-10 flex justify-end">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !hasUnsavedChanges}
                  className={`rounded-xl px-5 py-2.5 text-sm font-medium text-white transition ${
                    saving
                      ? "bg-accent shadow-[0_16px_36px_rgba(180,154,107,0.28)]"
                      : hasUnsavedChanges
                        ? "bg-accent shadow-[0_16px_36px_rgba(180,154,107,0.28)] hover:brightness-105"
                        : "bg-muted/60"
                  } disabled:cursor-not-allowed disabled:opacity-100`}
                >
                  {saving ? "正在保存..." : hasUnsavedChanges ? "保存会员授权" : "已保存"}
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">请选择一个会员查看授权配置。</div>
          )}
        </section>
      </section>
    </div>
  );
}

function FeatureSelect({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  compact?: boolean;
}) {
  return (
    <label className={`block text-sm ${compact ? "" : "rounded-xl border border-border bg-surface px-3 py-2"}`}>
      <span className="text-primary">{label}</span>
      <select
        className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-2 text-sm"
        value={value === null ? "inherit" : value ? "enabled" : "disabled"}
        onChange={(e) => onChange(e.target.value === "inherit" ? null : e.target.value === "enabled")}
      >
        <option value="inherit">继承默认</option>
        <option value="enabled">单独开启</option>
        <option value="disabled">单独关闭</option>
      </select>
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-primary">{label}</span>
      <input
        type="number"
        min={0}
        className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
        value={value ?? ""}
        placeholder="留空表示继承默认"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </label>
  );
}
