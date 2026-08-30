import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isValidMemberPhone, normalizeMemberPhone } from "@/lib/member-phone";
import { consumeRateLimit } from "@/lib/rate-limit";

export const SMS_REGISTRATION_PURPOSE = "registration";
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_DAILY_SENDS = 10;
const MAX_VERIFY_ATTEMPTS = 5;

export class SmsProviderConfigurationError extends Error {
  code = "BLOCKED_BY_SMS_PROVIDER_CONFIGURATION";
}

function getConfiguredProvider() {
  const provider = process.env.SMS_PROVIDER?.trim().toLowerCase();
  if (
    provider === "aliyun" &&
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim() &&
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim() &&
    process.env.SMS_SIGN_NAME?.trim() &&
    process.env.SMS_TEMPLATE_CODE?.trim()
  ) {
    return "aliyun" as const;
  }
  return null;
}

export function getSmsProviderReadiness() {
  const provider = getConfiguredProvider();
  return {
    provider,
    ready: provider !== null,
    credentialConfigured: Boolean(
      process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim() &&
        process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim(),
    ),
    signConfigured: Boolean(process.env.SMS_SIGN_NAME?.trim()),
    templateConfigured: Boolean(process.env.SMS_TEMPLATE_CODE?.trim()),
  };
}

function makeCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function deliverCode(phone: string, code: string) {
  if (getConfiguredProvider() !== "aliyun") {
    throw new SmsProviderConfigurationError();
  }

  const {
    AliyunSmsDeliveryError,
    AliyunSmsProviderConfigurationError,
    sendAliyunSms,
  } = await import("@/lib/aliyun-sms-provider");
  try {
    await sendAliyunSms({
      phone,
      code,
      signName: process.env.SMS_SIGN_NAME!,
      templateCode: process.env.SMS_TEMPLATE_CODE!,
    });
  } catch (error) {
    if (error instanceof AliyunSmsProviderConfigurationError) {
      throw new SmsProviderConfigurationError();
    }
    const providerCode = error instanceof AliyunSmsDeliveryError ? error.providerCode : "ALIYUN_SDK_ERROR";
    console.error("Aliyun SMS delivery failed", {
      eventCode: "ALIYUN_SMS_DELIVERY_FAILED",
      providerCode,
      phone: phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
      timestamp: new Date().toISOString(),
    });
    throw new Error("SMS_PROVIDER_REJECTED");
  }
}

export async function sendRegistrationSms(phoneInput: string, clientIp: string) {
  const phone = normalizeMemberPhone(phoneInput);
  if (!isValidMemberPhone(phone)) throw new Error("INVALID_PHONE");
  if (!getSmsProviderReadiness().ready) throw new SmsProviderConfigurationError();

  const ipRate = consumeRateLimit({ scope: "sms-send:ip", identifier: clientIp, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!ipRate.allowed) throw new Error("RATE_LIMITED");

  const since = new Date(Date.now() - RESEND_COOLDOWN_MS);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [recent, dailyCount] = await Promise.all([
    prisma.smsVerification.findFirst({
      where: { phone, purpose: SMS_REGISTRATION_PURPOSE, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.smsVerification.count({ where: { phone, purpose: SMS_REGISTRATION_PURPOSE, createdAt: { gte: dayStart } } }),
  ]);
  if (recent) throw new Error("RESEND_COOLDOWN");
  if (dailyCount >= MAX_DAILY_SENDS) throw new Error("DAILY_LIMIT");

  const code = makeCode();
  const verification = await prisma.smsVerification.create({
    data: {
      phone,
      purpose: SMS_REGISTRATION_PURPOSE,
      codeHash: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      // The record stays unusable until Aliyun explicitly accepts SendSms.
      usedAt: new Date(),
    },
  });
  await deliverCode(phone, code);
  const activated = await prisma.smsVerification.updateMany({
    where: { id: verification.id, usedAt: { not: null }, verifiedAt: null },
    data: { usedAt: null },
  });
  if (activated.count !== 1) throw new Error("SMS_VERIFICATION_ACTIVATION_FAILED");
}

export async function verifyRegistrationSms(phoneInput: string, code: string) {
  const phone = normalizeMemberPhone(phoneInput);
  if (!isValidMemberPhone(phone) || !/^\d{6}$/.test(code)) return false;
  const verification = await prisma.smsVerification.findFirst({
    where: { phone, purpose: SMS_REGISTRATION_PURPOSE, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!verification || verification.attemptCount >= MAX_VERIFY_ATTEMPTS) return false;
  const valid = await bcrypt.compare(code, verification.codeHash);
  if (!valid) {
    await prisma.smsVerification.update({ where: { id: verification.id }, data: { attemptCount: { increment: 1 } } });
    return false;
  }
  await prisma.smsVerification.update({ where: { id: verification.id }, data: { verifiedAt: new Date() } });
  return true;
}

export async function consumeVerifiedRegistrationSms(phoneInput: string) {
  const phone = normalizeMemberPhone(phoneInput);
  const verification = await prisma.smsVerification.findFirst({
    where: { phone, purpose: SMS_REGISTRATION_PURPOSE, usedAt: null, verifiedAt: { not: null }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!verification) return false;
  const consumed = await prisma.smsVerification.updateMany({
    where: { id: verification.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return consumed.count === 1;
}
