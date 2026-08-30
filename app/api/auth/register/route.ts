import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isValidMemberPhone, normalizeMemberPhone } from "@/lib/member-phone";
import { normalizeRecoveryEmail } from "@/lib/password-recovery";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { writeOperationLog } from "@/lib/operation-log";
import { consumeRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { consumeVerifiedRegistrationSms } from "@/lib/sms-verification";
import { storeIdentityDocument, validateIdentityDocument } from "@/lib/identity-documents";

export const dynamic = "force-dynamic";
const REGISTER_WINDOW_MS = 30 * 60 * 1000;
const REGISTER_IP_LIMIT = 10;

function normalizeAccount(value: string) { return value.trim().toLowerCase(); }
function readText(form: FormData, key: string) { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; }

export async function POST(request: NextRequest) {
  try {
    const ipLimit = consumeRateLimit({ scope: "auth-register:ip", identifier: getClientIp(request), limit: REGISTER_IP_LIMIT, windowMs: REGISTER_WINDOW_MS });
    if (!ipLimit.allowed) return createRateLimitResponse(ipLimit.retryAfterSec);
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "请使用完整的认证注册表单" }, { status: 400 });
    const account = normalizeAccount(readText(form, "account"));
    const password = readText(form, "password");
    const name = readText(form, "name");
    const phone = normalizeMemberPhone(readText(form, "phone"));
    const recoveryEmailRaw = readText(form, "recoveryEmail");
    const realName = readText(form, "realName");
    const identityDocumentType = readText(form, "identityDocumentType") || "居民身份证";
    const identityDocumentNumber = readText(form, "identityDocumentNumber");
    const region = readText(form, "region");
    const occupationType = readText(form, "occupationType");
    const companyOrOrganization = readText(form, "companyOrOrganization");
    const applicationReason = readText(form, "applicationReason");
    const agreedToTerms = readText(form, "agreedToTerms") === "true";
    const agreedToPrivacy = readText(form, "agreedToPrivacy") === "true";
    const front = form.get("identityDocumentFront");
    const back = form.get("identityDocumentBack");
    if (!account || !password || !phone || !realName || !identityDocumentNumber || !region || !occupationType || !applicationReason) return NextResponse.json({ error: "请完整填写注册及实名认证资料" }, { status: 400 });
    if (!agreedToTerms || !agreedToPrivacy || !validateIdentityDocument(front) || !validateIdentityDocument(back)) return NextResponse.json({ error: "请上传有效证件正反面并同意用户协议和隐私政策" }, { status: 400 });
    if (account.length < 4 || !/^[a-z0-9._-]+$/.test(account)) return NextResponse.json({ error: "账号格式不正确" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    if (!isValidMemberPhone(phone)) return NextResponse.json({ error: "手机号格式不正确，请填写 11 位中国大陆手机号" }, { status: 400 });
    const recoveryEmail = recoveryEmailRaw ? normalizeRecoveryEmail(recoveryEmailRaw) : null;
    if (recoveryEmailRaw && !recoveryEmail) return NextResponse.json({ error: "找回邮箱格式不正确" }, { status: 400 });
    if (!(await consumeVerifiedRegistrationSms(phone))) return NextResponse.json({ error: "请先完成手机短信验证" }, { status: 403 });
    const [existingAccount, existingPhone] = await Promise.all([
      prisma.member.findUnique({ where: { email: account }, select: { id: true } }),
      prisma.member.findFirst({ where: { phone, memberType: "personal" }, select: { id: true } }),
    ]);
    if (existingAccount) return NextResponse.json({ error: "该账号已存在" }, { status: 400 });
    if (existingPhone) return NextResponse.json({ error: "该手机号已绑定个人会员账号" }, { status: 400 });
    const member = await prisma.member.create({
      data: {
        email: account, name: name || null, phone, phoneVerified: true, recoveryEmail, role: "MEMBER", membershipLevel: "member", memberType: "personal", accountStatus: "pending_review", rankingWeight: 0, passwordHash: await bcrypt.hash(password, 10), registeredAt: new Date(),
        realName, identityDocumentType, identityDocumentNumber, region, occupationType, companyOrOrganization: companyOrOrganization || null, applicationReason, agreedToTermsAt: new Date(), agreedToPrivacyAt: new Date(),
      },
      select: { id: true, email: true, role: true, memberType: true },
    });
    try {
      const [identityDocumentFrontPath, identityDocumentBackPath] = await Promise.all([storeIdentityDocument(member.id, "front", front), storeIdentityDocument(member.id, "back", back)]);
      await prisma.member.update({ where: { id: member.id }, data: { identityDocumentFrontPath, identityDocumentBackPath } });
    } catch {
      await prisma.member.delete({ where: { id: member.id } });
      return NextResponse.json({ error: "证件资料保存失败，请重新注册" }, { status: 500 });
    }
    await writeOperationLog({ actorId: member.id, actorEmail: member.email, action: "self_register_pending_review", targetType: "member", targetId: member.id, detail: JSON.stringify({ memberType: member.memberType }) });
    const token = await signToken({ sub: member.id, email: member.email, role: member.role, memberType: member.memberType });
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const isHttpsRequest = forwardedProto === "https" || request.nextUrl.protocol === "https:";
    const res = NextResponse.json({ ok: true, role: member.role, memberType: member.memberType, accountStatus: "pending_review" });
    res.cookies.set("auth", token, { httpOnly: true, secure: process.env.NODE_ENV === "production" ? isHttpsRequest : false, sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    return res;
  } catch {
    console.error("POST /api/auth/register failed");
    return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
  }
}
