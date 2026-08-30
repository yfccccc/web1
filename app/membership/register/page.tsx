"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const MAINLAND_MOBILE_PATTERN = /^1[3-9]\d{9}$/;

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [realName, setRealName] = useState("");
  const [identityDocumentNumber, setIdentityDocumentNumber] = useState("");
  const [region, setRegion] = useState("");
  const [occupationType, setOccupationType] = useState("");
  const [companyOrOrganization, setCompanyOrOrganization] = useState("");
  const [applicationReason, setApplicationReason] = useState("");
  const [identityDocumentFront, setIdentityDocumentFront] = useState<File | null>(null);
  const [identityDocumentBack, setIdentityDocumentBack] = useState<File | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendSms() {
    const normalizedPhone = phone.replace(/\s+/g, "").trim();
    if (!MAINLAND_MOBILE_PATTERN.test(normalizedPhone)) {
      setError("请先填写正确的 11 位中国大陆手机号");
      return;
    }
    setSendingSms(true);
    setError("");
    try {
      const res = await fetch("/api/auth/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: normalizedPhone, purpose: "registration" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.code === "BLOCKED_BY_SMS_PROVIDER_CONFIGURATION" ? "短信服务尚未启用，暂不能提交注册。" : data.error ?? "验证码发送失败");
        return;
      }
      setSmsMessage("验证码已发送，请在 5 分钟内完成验证。");
    } catch { setError("网络异常，请稍后再试"); } finally { setSendingSms(false); }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setError("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    const normalizedPhone = phone.replace(/\s+/g, "").trim();
    if (!normalizedPhone) {
      setError("手机号必填");
      return;
    }

    if (!MAINLAND_MOBILE_PATTERN.test(normalizedPhone)) {
      setError("手机号格式不正确，请填写 11 位中国大陆手机号");
      return;
    }

    if (!smsCode || !realName || !identityDocumentNumber || !region || !occupationType || !applicationReason || !identityDocumentFront || !identityDocumentBack || !agreedToTerms || !agreedToPrivacy) {
      setError("请完成短信验证、实名认证资料并同意相关协议");
      return;
    }
    setLoading(true);
    try {
      const verify = await fetch("/api/auth/sms/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: normalizedPhone, code: smsCode.trim(), purpose: "registration" }) });
      if (!verify.ok) { const data = await verify.json().catch(() => ({})); setError(data.error ?? "短信验证码无效"); return; }
      const payload = new FormData();
      for (const [key, value] of Object.entries({ name: name.trim(), account: account.trim(), phone: normalizedPhone, recoveryEmail: recoveryEmail.trim(), password, realName: realName.trim(), identityDocumentType: "居民身份证", identityDocumentNumber: identityDocumentNumber.trim(), region: region.trim(), occupationType, companyOrOrganization: companyOrOrganization.trim(), applicationReason: applicationReason.trim(), agreedToTerms: String(agreedToTerms), agreedToPrivacy: String(agreedToPrivacy) })) payload.append(key, value);
      payload.append("identityDocumentFront", identityDocumentFront);
      payload.append("identityDocumentBack", identityDocumentBack);
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        body: payload,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "注册失败，请稍后重试");
        return;
      }

      router.push("/membership/content");
      router.refresh();
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-12">
      <div className="grid gap-4 lg:grid-cols-[0.98fr_1.02fr] lg:gap-6">
        <section className="rounded-[28px] border border-[#e9dbc5] bg-[linear-gradient(145deg,rgba(251,247,240,0.98),rgba(244,235,220,0.9))] px-5 py-6 text-[#3d3126] shadow-[0_24px_70px_rgba(111,78,38,0.08)] sm:px-7 sm:py-8">
          <p className="text-[11px] uppercase tracking-[0.32em] text-[#9d7c54]">Membership</p>
          <h1 className="mt-3 font-serif text-[2rem] leading-tight text-[#2f241a] sm:text-[2.5rem]">
            会员注册
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[#6c5a46] sm:text-[15px]">
            先创建个人会员账号，后续可提交企业认证并升级为企业基础会员，继续完善品牌与内容发布能力。
          </p>

          <div className="mt-6 space-y-3">
            <BenefitRow title="先注册再认证" description="注册完成后即可进入会员后台，继续提交企业认证资料。" />
            <BenefitRow title="账号可长期使用" description="后续找回邮箱、注册手机号、账号安全和资料配置都在同一体系内管理。" />
            <BenefitRow title="适配手机端" description="移动端也能完成注册、认证和日常内容维护。" />
          </div>
        </section>

        <section className="rounded-[28px] border border-[#ece2d2] bg-white/96 px-5 py-6 shadow-[0_22px_64px_rgba(94,72,44,0.08)] sm:px-7 sm:py-8">
          <div className="mb-6 space-y-2">
            <h2 className="font-serif text-2xl text-[#2f241a]">创建会员账号</h2>
            <p className="text-sm leading-6 text-[#7a6650]">建议填写常用邮箱，后续可用于找回密码和安全验证。</p>
            <p className="text-sm leading-6 text-[#7a6650]">手机号用于账号找回、认证审核和平台联系，不会在前台公开展示。</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              id="name"
              label="名称"
              value={name}
              onChange={setName}
              placeholder="昵称或联系人姓名"
            />

            <FormField
              id="account"
              label="账号"
              value={account}
              onChange={setAccount}
              required
              autoComplete="username"
              placeholder="至少 4 位，仅支持小写字母/数字/._-"
            />

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><FormField id="phone" label="手机号" value={phone} onChange={setPhone} required autoComplete="tel" placeholder="请输入 11 位中国大陆手机号" /><button type="button" onClick={sendSms} disabled={sendingSms} className="rounded-full border border-[#c9a46b] px-4 py-3 text-sm text-[#7f6542] disabled:opacity-50">{sendingSms ? "发送中..." : "获取验证码"}</button></div>
            <FormField id="smsCode" label="短信验证码" value={smsCode} onChange={setSmsCode} required placeholder="6 位验证码" />
            {smsMessage ? <p className="text-sm text-emerald-700">{smsMessage}</p> : null}
            <FormField id="realName" label="真实姓名" value={realName} onChange={setRealName} required />
            <FormField id="identityDocumentNumber" label="身份证号码" value={identityDocumentNumber} onChange={setIdentityDocumentNumber} required />
            <div className="grid gap-4 sm:grid-cols-2"><FormField id="region" label="所在地区" value={region} onChange={setRegion} required /><label className="block"><span className="mb-2 block text-sm font-medium text-[#5b4a39]">职业身份 *</span><select value={occupationType} onChange={(e) => setOccupationType(e.target.value)} required className="w-full rounded-2xl border border-[#eadfce] bg-[#fffdfa] px-4 py-3 text-[15px]"><option value="">请选择</option>{["设计师","整木企业从业人员","家具企业从业人员","门店经营者","经销商","供应链企业","媒体","自媒体","消费者","其他"].map((x) => <option key={x}>{x}</option>)}</select></label></div>
            <FormField id="companyOrOrganization" label="企业/机构名称（选填）" value={companyOrOrganization} onChange={setCompanyOrOrganization} />
            <label className="block"><span className="mb-2 block text-sm font-medium text-[#5b4a39]">申请说明 *</span><textarea value={applicationReason} onChange={(e) => setApplicationReason(e.target.value)} required className="w-full rounded-2xl border border-[#eadfce] bg-[#fffdfa] px-4 py-3" /></label>
            <div className="grid gap-4 sm:grid-cols-2"><FileField label="身份证正面 *" onChange={setIdentityDocumentFront} /><FileField label="身份证反面 *" onChange={setIdentityDocumentBack} /></div>
            <label className="flex gap-2 text-sm text-[#6c5a46]"><input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />我已同意用户协议</label><label className="flex gap-2 text-sm text-[#6c5a46]"><input type="checkbox" checked={agreedToPrivacy} onChange={(e) => setAgreedToPrivacy(e.target.checked)} />我已同意隐私政策</label>

            <FormField
              id="recoveryEmail"
              label="找回邮箱"
              type="email"
              value={recoveryEmail}
              onChange={setRecoveryEmail}
              autoComplete="email"
              placeholder="建议填写常用邮箱"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="password"
                label="密码"
                type="password"
                value={password}
                onChange={setPassword}
                required
                autoComplete="new-password"
              />
              <FormField
                id="confirmPassword"
                label="确认密码"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                autoComplete="new-password"
              />
            </div>

            {error ? (
              <p className="rounded-2xl border border-[#f1d4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#b84c4c]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#a27d4f] px-5 py-3 text-sm font-medium tracking-[0.08em] text-white transition hover:bg-[#8e6b42] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "注册中..." : "注册并进入会员系统"}
            </button>
          </form>

          <p className="mt-5 text-sm text-[#7a6650]">
            已有账号？
            <Link href="/membership/login" className="ml-2 text-[#9d7c54] transition hover:text-[#7f6542]">
              去登录
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

function FileField({ label, onChange }: { label: string; onChange: (file: File | null) => void }) { return <label className="block"><span className="mb-2 block text-sm font-medium text-[#5b4a39]">{label}</span><input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="w-full text-sm" /><span className="mt-1 block text-xs text-[#7a6650]">仅 JPEG、PNG、WebP，最大 5MB；仅供审核人员查看。</span></label>; }

function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#5b4a39]">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[#eadfce] bg-[#fffdfa] px-4 py-3 text-[15px] text-[#2f241a] outline-none transition focus:border-[#c9a46b] focus:bg-white"
      />
    </label>
  );
}

function BenefitRow({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] border border-white/60 bg-white/58 px-4 py-4 backdrop-blur">
      <p className="text-sm font-medium text-[#3b2f24]">{title}</p>
      <p className="mt-2 text-xs leading-6 text-[#7a6650]">{description}</p>
    </div>
  );
}
