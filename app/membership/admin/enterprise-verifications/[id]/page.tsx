"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InlinePageBackLink } from "@/components/InlinePageBackLink";
import { VerificationCard, type VerificationItem } from "../components/VerificationCard";

export default function VerificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<VerificationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewText, setReviewText] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/enterprise-verifications/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok) { setItem(null); setMessage(data.error || "读取申请失败"); return; }
      setItem(data);
    } catch { setItem(null); setMessage("读取申请失败，请重试"); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { setMessage(""); void load(); }, [load]);

  async function review(action: "approve" | "reject") {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/enterprise-verifications/${encodeURIComponent(id)}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote: reviewText }),
      });
      const data = await res.json();
      setMessage(res.ok ? (action === "approve" ? "审核通过，账号已激活。" : "认证申请已驳回。") : data.error || "审核失败");
      if (res.ok || res.status === 409) await load();
    } catch { setMessage("审核请求失败，请刷新核实状态后重试"); }
    finally { setSaving(false); }
  }

  return <div className="max-w-4xl space-y-6">
    <InlinePageBackLink href="/membership/admin/accounts" label="返回账号一览" />
    <h1 className="font-serif text-2xl font-bold text-primary">企业资质审核详情</h1>
    {message && <p role="status" className="text-sm text-accent">{message}</p>}
    {loading ? <p>加载中...</p> : item ? <VerificationCard item={item}
      reviewText={reviewText} saving={saving} onReviewTextChange={setReviewText}
      onReview={(action) => void review(action)} /> :
      <button className="apple-inline-link" onClick={() => void load()}>重新加载</button>}
  </div>;
}
