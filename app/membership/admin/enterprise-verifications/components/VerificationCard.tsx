import Image from "next/image";
import Link from "next/link";
import { resolveUploadedImageUrl } from "@/lib/uploaded-image";

type Status = "pending" | "approved" | "rejected";

export type VerificationItem = {
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
  approvedEnterpriseId?: string | null;
  member: {
    email: string;
    name?: string | null;
    memberType: string;
  };
};

function statusText(status: Status) {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已驳回";
  return "待审核";
}

function Info({
  label,
  value,
  multiline,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-primary ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</p>
    </div>
  );
}

export function VerificationCard({
  item,
  reviewText,
  saving,
  onReviewTextChange,
  onReview,
}: {
  item: VerificationItem;
  reviewText: string;
  saving: boolean;
  onReviewTextChange: (value: string) => void;
  onReview: (action: "approve" | "reject") => void;
}) {
  return (
    <article className="rounded-xl border border-border bg-surface-elevated p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-primary">{item.companyName}</h2>
          <p className="text-xs text-muted">
            提交账号：{item.member.email} / {item.member.memberType}
          </p>
        </div>
        <p className="text-sm text-primary">{statusText(item.status)}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <Info label="企业简称" value={item.companyShortName} />
        <Info label="联系人" value={item.contactPerson} />
        <Info label="联系电话" value={item.contactPhone} />
        <Info label="联系邮箱" value={item.contactEmail} />
        <Info label="信用代码" value={item.licenseCode} />
        <Info label="企业地址" value={item.address} />
        <Info label="官网" value={item.website} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted mb-1">企业 Logo</p>
          {item.logoUrl ? (
            <Image
              src={resolveUploadedImageUrl(item.logoUrl)}
              alt="logo"
              width={80}
              height={80}
              className="h-20 w-20 object-cover rounded border border-border"
            />
          ) : (
            <p className="text-xs text-muted">未上传</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted mb-1">营业执照</p>
          <Image
            src={resolveUploadedImageUrl(item.licenseImageUrl)}
            alt="license"
            width={240}
            height={112}
            className="h-28 w-auto object-contain rounded border border-border bg-white"
          />
        </div>
      </div>

      {(item.intro || item.businessScope || item.productSystem || item.coreAdvantages) && (
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <Info label="企业介绍" value={item.intro} multiline />
          <Info label="经营范围" value={item.businessScope} multiline />
          <Info label="产品体系" value={item.productSystem} multiline />
          <Info label="核心优势" value={item.coreAdvantages} multiline />
        </div>
      )}

      {item.status === "approved" && item.approvedEnterpriseId && (
        <Link href={`/enterprise/${item.approvedEnterpriseId}`} className="apple-inline-link">
          查看生成后的企业详情页
        </Link>
      )}

      {item.reviewNote && <p className="text-sm text-muted">审核意见：{item.reviewNote}</p>}

      {item.status === "pending" && (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-muted">审核意见，可选</span>
            <textarea
              className="mt-1 w-full min-h-20 px-3 py-2 border border-border rounded bg-surface text-sm"
              value={reviewText}
              onChange={(e) => onReviewTextChange(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => onReview("approve")}
              className="px-3 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-50"
            >
              通过并生成详情页
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onReview("reject")}
              className="px-3 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-50"
            >
              驳回
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
