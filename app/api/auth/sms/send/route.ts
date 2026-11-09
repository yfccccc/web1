import { NextRequest, NextResponse } from "next/server";
import { createRateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { sendRegistrationSms, SmsProviderConfigurationError } from "@/lib/sms-verification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body?.purpose !== "registration" || typeof body?.phone !== "string") {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }
  try {
    await sendRegistrationSms(body.phone, getClientIp(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SmsProviderConfigurationError) {
      return NextResponse.json({ error: "短信服务尚未配置", code: error.code }, { status: 503 });
    }
    if (error instanceof Error && error.message === "RATE_LIMITED") return createRateLimitResponse(3600);
    if (error instanceof Error && ["RESEND_COOLDOWN", "DAILY_LIMIT"].includes(error.message)) {
      return NextResponse.json({ error: "发送过于频繁，请稍后再试" }, { status: 429 });
    }
    if (error instanceof Error && error.message === "INVALID_PHONE") {
      return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 });
    }
    return NextResponse.json({ error: "短信发送失败，请稍后再试" }, { status: 502 });
  }
}
