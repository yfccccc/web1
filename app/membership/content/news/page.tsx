"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { NEWS_SUBCATEGORY_OPTIONS } from "@/lib/content-taxonomy";
import { InlinePageBackLink } from "@/components/InlinePageBackLink";
import { buildDirtyTextErrorMessage } from "@/lib/article-input-guard";

const RichEditor = dynamic(() => import("@/components/RichEditor").then((mod) => mod.RichEditor), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-border bg-surface-elevated p-4 text-sm text-muted">
      富文本编辑器加载中...
    </div>
  ),
});

type ArticleItem = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "pending" | "approved" | "rejected";
  createdAt: string;
};

type AccessSubcategory = {
  href: string;
  label: string;
  enabled: boolean;
  annualLimit: number | null;
  remainingCount: number | null;
};

type AccessCategory = {
  href: string;
  enabled: boolean;
  annualLimit: number | null;
  remainingCount: number | null;
  subcategories: AccessSubcategory[];
};

const STATUS_TEXT: Record<ArticleItem["status"], string> = {
  draft: "草稿",
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

function makeSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export default function MembershipContentNewsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [memberType, setMemberType] = useState<string>("personal");
  const [canPublish, setCanPublish] = useState(false);
  const [newsCategoryAccess, setNewsCategoryAccess] = useState<AccessCategory | null>(null);
  const [memberTypeLabel, setMemberTypeLabel] = useState("个人会员");
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [subHref, setSubHref] = useState("/news/trends");
  const [message, setMessage] = useState("");
  const [editorStatusVersion, setEditorStatusVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const newsPublishLimit = newsCategoryAccess?.annualLimit ?? null;
  const newsSubcategoryOptions =
    newsCategoryAccess?.subcategories ??
    NEWS_SUBCATEGORY_OPTIONS.map((option) => ({
      ...option,
      enabled: true,
      annualLimit: null,
      remainingCount: null,
    }));

  const handleImportedTitle = useCallback(
    (nextTitleRaw: string) => {
      const nextTitle = nextTitleRaw.trim();
      if (!nextTitle) return;

      if (!title.trim()) {
        setTitle(nextTitle);
        setMessage(`已识别并填入文档标题：${nextTitle}`);
        return;
      }

      if (title.trim() === nextTitle) {
        setMessage(`已识别到相同文档标题：${nextTitle}`);
        return;
      }

      const shouldReplace = window.confirm(`检测到文档标题：${nextTitle}，是否替换当前标题？`);
      if (shouldReplace) {
        setTitle(nextTitle);
        setMessage(`已替换为文档标题：${nextTitle}`);
        return;
      }

      setMessage(`已识别到文档标题：${nextTitle}，已保留当前标题。`);
    },
    [title]
  );

  async function load(query = "") {
    const meRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!meRes.ok) {
      setAuthed(false);
      return;
    }
    setAuthed(true);

    const me = await meRes.json();
    setMemberType(me.memberType ?? "personal");
    const categoryAccess = Array.isArray(me.memberAccess?.categories)
      ? me.memberAccess.categories.find((item: AccessCategory) => item.href === "/news") ?? null
      : null;
    setNewsCategoryAccess(categoryAccess);
    setCanPublish(Boolean(categoryAccess?.enabled));
    setMemberTypeLabel(typeof me.memberTypeLabel === "string" ? me.memberTypeLabel : "个人会员");

    const listSp = new URLSearchParams({ limit: "20" });
    if (query.trim()) listSp.set("q", query.trim());
    const listRes = await fetch(`/api/member/articles?${listSp.toString()}`, { credentials: "include" });

    if (listRes.ok) {
      const data = await listRes.json();
      setItems(data.items ?? []);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const enabledSub = newsCategoryAccess?.subcategories.find((item) => item.enabled);
    if (enabledSub && !newsCategoryAccess?.subcategories.some((item) => item.href === subHref && item.enabled)) {
      setSubHref(enabledSub.href);
    }
  }, [newsCategoryAccess, subHref]);

  useEffect(() => {
    setEditorStatusVersion((value) => value + 1);
  }, [subHref]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!newsSubcategoryOptions.some((item) => item.href === subHref && item.enabled)) {
      setMessage("当前子栏目未开通投稿权限，请联系管理员授权。");
      return;
    }
    setLoading(true);
    setMessage("");

    const payload = {
      title: title.trim(),
      slug: (slug || makeSlug(title)).trim(),
      content: content.trim(),
      subHref,
      categoryHref: "/news",
      syncToMainSite: subHref === "/news/enterprise",
    };

    const dirtyTextError = buildDirtyTextErrorMessage([
      { label: "标题", value: payload.title },
      { label: "正文", value: payload.content },
    ]);
    if (dirtyTextError) {
      setMessage(dirtyTextError);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/member/articles", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data.error ?? "提交失败");
      setLoading(false);
      return;
    }

    setMessage("提交成功，已进入待审核队列");
    setTitle("");
    setSlug("");
    setContent("");
    setEditorStatusVersion((value) => value + 1);
    await load(search);
    setLoading(false);
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    void load(search);
  }

  function clearSearch() {
    setSearch("");
    void load("");
  }

  if (authed === false) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-sm text-muted mb-3">请先登录后再发布资讯内容。</p>
        <Link href="/membership/login" className="apple-inline-link">
          前往登录
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <nav className="mb-6 text-sm text-muted" aria-label="面包屑">
        <Link href="/" className="hover:text-accent">
          首页
        </Link>
        <span className="mx-2">/</span>
        <Link href="/membership" className="hover:text-accent">
          会员系统
        </Link>
        <span className="mx-2">/</span>
        <span className="text-primary">资讯发布</span>
      </nav>

      <h1 className="mb-2 font-serif text-2xl font-bold text-primary">资讯发布</h1>
      <p className="mb-6 text-sm text-muted">企业会员提交内容后默认待审核，审核通过后同步到主站栏目。</p>

      <InlinePageBackLink href="/membership" label="返回会员系统" />
      {message && <p className="mb-4 text-sm text-accent">{message}</p>}

      {!canPublish ? (
        <div className="rounded-lg border border-border p-4 text-sm text-muted">{memberTypeLabel}当前不具备整木资讯发布权限。</div>
      ) : (
        <form onSubmit={submit} className="mb-8 space-y-3 rounded-lg border border-border bg-surface-elevated p-4">
          {newsCategoryAccess?.annualLimit != null && (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
              当前账号资讯发布上限：{newsPublishLimit} 篇
            </p>
          )}
          <label className="block text-sm text-muted">标题</label>
          <input className="w-full rounded border border-border bg-surface px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} required />

          <label className="block text-sm text-muted">Slug（可选）</label>
          <input className="w-full rounded border border-border bg-surface px-3 py-2" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="不填将根据标题自动生成" />

          <label className="block text-sm text-muted">所属子栏目</label>
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2">
            {newsSubcategoryOptions.map((option) => {
              const active = subHref === option.href;
              const disabled = !option.enabled;
              return (
                <button
                  key={option.href}
                  type="button"
                  onClick={() => {
                    if (!disabled) setSubHref(option.href);
                  }}
                  disabled={disabled}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    disabled
                      ? "cursor-not-allowed border border-dashed border-border bg-surface text-muted/70"
                      : active
                        ? "bg-accent text-white"
                        : "border border-border bg-surface-elevated text-primary hover:bg-surface"
                  }`}
                >
                  <span>{option.label}</span>
                  <span className="ml-2 text-[11px] opacity-80">
                    {disabled
                      ? "未开通"
                      : option.annualLimit == null
                        ? "不限"
                        : `剩余 ${option.remainingCount ?? 0}/${option.annualLimit}`}
                  </span>
                </button>
              );
            })}
          </div>

          <label className="block text-sm text-muted">正文</label>
          <RichEditor
            value={content}
            onChange={setContent}
            onImportedTitle={handleImportedTitle}
            minHeight={300}
            placeholder="支持从网页、Word、公众号粘贴图文内容，系统会尽量保留排版并自动转存图片。"
            allowClipboardImagePaste={authed === true}
            toolbarIcons
            statusResetKey={`member-news:${subHref}:${editorStatusVersion}`}
          />

          <button disabled={loading} className="rounded bg-accent px-4 py-2 text-sm text-white disabled:opacity-50">
            {loading ? "提交中..." : "提交审核"}
          </button>
        </form>
      )}

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-3 font-medium text-primary">我的资讯</h2>
        <form
          onSubmit={submitSearch}
          className="mb-4 flex flex-col gap-3 rounded-[20px] border border-border bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,243,236,0.94))] p-4 md:flex-row md:items-center"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary">搜索我的资讯</p>
            <p className="mt-1 text-xs text-muted">支持按标题、摘要、正文、来源、作者、标签、关键词、企业或品牌名查找。</p>
          </div>
          <div className="flex min-w-0 flex-1 gap-2">
            <input
              className="h-11 min-w-0 flex-1 rounded-2xl border border-[rgba(194,182,154,0.28)] bg-white/90 px-4 text-sm text-primary placeholder:text-muted focus:border-[rgba(180,154,107,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(180,154,107,0.18)]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入标题、作者、来源、标签、关键词、企业或品牌"
            />
            <button type="submit" className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white">
              搜索
            </button>
            {search && (
              <button type="button" onClick={clearSearch} className="rounded-2xl border border-border px-4 py-2 text-sm text-primary hover:bg-surface">
                清除
              </button>
            )}
          </div>
        </form>
        {items.length === 0 ? (
          <p className="text-sm text-muted">暂无记录</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between border-b border-border pb-2 text-sm">
                <span className="truncate text-primary">{item.title}</span>
                <span className="text-muted">{STATUS_TEXT[item.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
