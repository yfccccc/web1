import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationSms } from "@/lib/sms-verification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body?.purpose !== "registration" || typeof body?.phone !== "string" || typeof body?.code !== "string") {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }
  const verified = await verifyRegistrationSms(body.phone, body.code.trim());
  if (!verified) return NextResponse.json({ error: "验证码无效、已过期或尝试次数已达上限" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
