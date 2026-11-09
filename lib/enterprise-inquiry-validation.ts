import { createHmac } from "node:crypto";

export type EnterpriseInquiryInput = {
  enterpriseId: string;
  visitorName: string;
  phone: string;
  demand: string;
  city: string;
  wechat: string;
  company: string;
  sourcePage: string;
};

const LIMITS = {
  enterpriseId: 64,
  visitorName: 60,
  phone: 48,
  demand: 1200,
  city: 80,
  wechat: 80,
  company: 120,
  sourcePage: 255,
} as const;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isCompatibleContactPhone(value: string) {
  if (value.length > LIMITS.phone || /[<>\u0000-\u001f\u007f]/.test(value)) return false;
  if (!/^\+?[\d\s()./\-]+(?:(?:转|ext(?:ension)?|x|#)\s*\d{1,8})?$/i.test(value)) return false;
  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= 6 && digitCount <= 20;
}

function normalizeDigestText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildEnterpriseInquiryDuplicateIdentifier(
  input: Pick<EnterpriseInquiryInput, "phone" | "company" | "demand" | "sourcePage">,
  secret: Uint8Array,
) {
  const normalized = [
    input.phone.replace(/\D/g, ""),
    normalizeDigestText(input.company),
    normalizeDigestText(input.demand),
    normalizeDigestText(input.sourcePage),
  ].join("\u001f");
  return createHmac("sha256", secret).update(normalized).digest("hex");
}

export function validateEnterpriseInquiry(body: unknown):
  | { ok: true; value: EnterpriseInquiryInput; honeypot: boolean }
  | { ok: false; error: string } {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const value: EnterpriseInquiryInput = {
    enterpriseId: text(input.enterpriseId),
    visitorName: text(input.visitorName),
    phone: text(input.phone),
    demand: text(input.demand),
    city: text(input.city),
    wechat: text(input.wechat),
    company: text(input.company),
    sourcePage: text(input.sourcePage),
  };

  if (!value.enterpriseId) return { ok: false, error: "企业信息缺失，请重新进入咨询页提交。" };
  if (!value.visitorName) return { ok: false, error: "请填写联系人姓名。" };
  if (!value.phone) return { ok: false, error: "请填写联系电话。" };
  if (!value.demand) return { ok: false, error: "请填写需求内容。" };

  for (const [key, limit] of Object.entries(LIMITS) as Array<[keyof EnterpriseInquiryInput, number]>) {
    if (value[key].length > limit) {
      return { ok: false, error: `提交内容过长，请精简${key === "demand" ? "需求描述" : "相关字段"}。` };
    }
  }
  if (!isCompatibleContactPhone(value.phone)) {
    return { ok: false, error: "联系电话格式不正确，请检查后重试。" };
  }

  return { ok: true, value, honeypot: Boolean(text(input.website)) };
}
