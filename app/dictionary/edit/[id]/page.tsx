"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { InlinePageBackLink } from "@/components/InlinePageBackLink";
import { RichEditor } from "@/components/RichEditor";

type Item = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  updatedAt: string;
};

export default function DictionaryEditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [canDirectEdit, setCanDirectEdit] = useState(false);
  const [item, setItem] = useState<Item | null>(null);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLParagraphElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/member/dictionary-entries/${id}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) setAuthed(false);
      else setMessage(data.error ?? "加载失败");
      setLoading(false);
      return;
    }

    const article = data.article as Item;
    setItem(article);
    setTitle(article.title ?? "");
    setExcerpt(article.excerpt ?? "");
    setContent(article.content ?? "");
    setCanDirectEdit(data.canDirectEdit === true);
    setAuthed(true);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [message]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/member/dictionary-entries/${item.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        excerpt,
        content,
        reason: reason.trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error ?? "提交失败");
      setSaving(false);
      return;
    }

    if (data.mode === "direct") {
      setMessage("修改已保存并生效。");
      await load();
    } else {
      setMessage("修改申请已提交，等待管理员审核。");
      setReason("");
    }
    setSaving(false);
  }

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-10 text-muted">加载中...</div>;

  if (!authed) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="mb-3 text-sm text-muted">请先登录后再修改词条。</p>
        <Link href="/membership/login" className="apple-inline-link">前往登录</Link>
      </div>
    );
  }

  if (!item) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted">词条不存在或不可修改。</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <nav className="text-sm text-muted" aria-label="面包屑">
        <Link href="/" className="hover:text-accent">首页</Link>
        <span className="mx-2">/</span>
        <Link href="/dictionary" className="hover:text-accent">整木词库</Link>
        <span className="mx-2">/</span>
        <Link href={`/dictionary/${item.slug}`} className="hover:text-accent">{item.title}</Link>
        <span className="mx-2">/</span>
        <span className="text-primary">提出修改</span>
      </nav>

      <InlinePageBackLink href={`/dictionary/${item.slug}`} label="返回词条" />
      <header className="rounded-xl border border-border bg-surface-elevated p-5">
        <h1 className="font-serif text-2xl font-bold text-primary">词条修改</h1>
        <p className="mt-2 text-sm text-muted">
          当前模式：{canDirectEdit ? "直接修改并生效" : "提交修改申请，审核后生效"}
        </p>
        <p className="mt-1 text-xs text-muted">正文支持富文本、图片、表格以及 DOCX/TXT 文档导入。</p>
        {message ? (
          <p ref={messageRef} className="mt-2 scroll-mt-24 text-sm text-accent">{message}</p>
        ) : null}
      </header>

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-surface-elevated p-5">
        <label className="block text-sm text-muted">词条标题</label>
        <input
          className="w-full rounded border border-border bg-surface px-3 py-2"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />

        <label className="block text-sm text-muted">摘要</label>
        <textarea
          className="min-h-[80px] w-full rounded border border-border bg-surface px-3 py-2"
          value={excerpt}
          onChange={(event) => setExcerpt(event.target.value)}
        />

        <label className="block text-sm text-muted">词条正文</label>
        <RichEditor
          value={content}
          onChange={setContent}
          onImportedTitle={(importedTitle) => {
            if (!title.trim()) setTitle(importedTitle);
          }}
          minHeight={360}
          placeholder="支持标题、列表、引用、链接、图片、表格以及 DOCX/TXT 文档导入。"
          allowClipboardImagePaste
          toolbarIcons
          statusResetKey={`dictionary-edit:${item.id}`}
        />

        {!canDirectEdit ? (
          <>
            <label className="block text-sm text-muted">修改说明（将提供给审核人员）</label>
            <input
              className="w-full rounded border border-border bg-surface px-3 py-2"
              placeholder="例如：补充术语定义，修正错别字"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </>
        ) : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "提交中..." : canDirectEdit ? "保存修改" : "提交审核"}
          </button>
          <Link href={`/dictionary/${item.slug}`} className="rounded border border-border px-4 py-2 text-sm">返回词条</Link>
        </div>
      </form>
    </div>
  );
}
