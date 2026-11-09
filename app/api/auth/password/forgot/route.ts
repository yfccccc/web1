import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { issuePasswordResetForMember } from "@/lib/password-recovery";
import { writeOperationLog } from "@/lib/operation-log";
import { consumeRateLimit, createRateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { buildSafeErrorLog, maskEmail } from "@/lib/log-safety";

export const dynamic = "force-dynamic";
const PASSWORD_FORGOT_WINDOW_MS = 30 * 60 * 1000;
const PASSWORD_FORGOT_IP_LIMIT = 5;
const PASSWORD_FORGOT_ACCOUNT_LIMIT = 3;

function normalizeAccount(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const GENERIC_SUCCESS_MESSAGE = "如果账号存在且已配置找回邮箱，系统会发送密码重置说明。";

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  let targetId: string | null = null;
  let stage = "validate_request";
  try {
    const ipLimit = consumeRateLimit({
      scope: "auth-password-forgot:ip",
      identifier: getClientIp(request),
      limit: PASSWORD_FORGOT_IP_LIMIT,
      windowMs: PASSWORD_FORGOT_WINDOW_MS,
    });
    if (!ipLimit.allowed) {
      return createRateLimitResponse(ipLimit.retryAfterSec);
    }

    const body = await request.json().catch(() => ({}));
    const account = normalizeAccount(body?.account);

    if (!account) {
      return NextResponse.json({ error: "请输入账号。" }, { status: 400 });
    }

    const accountLimit = consumeRateLimit({
      scope: "auth-password-forgot:account",
      identifier: account,
      limit: PASSWORD_FORGOT_ACCOUNT_LIMIT,
      windowMs: PASSWORD_FORGOT_WINDOW_MS,
    });
    if (!accountLimit.allowed) {
      return createRateLimitResponse(accountLimit.retryAfterSec);
    }

    const member = await prisma.member.findUnique({
      where: { email: account },
      select: {
        id: true,
        email: true,
        recoveryEmail: true,
        passwordResetRequestedAt: true,
      },
    });

    if (!member) {
      return NextResponse.json({
        ok: true,
        message: GENERIC_SUCCESS_MESSAGE,
        reason: "account_hidden",
      });
    }

    targetId = member.id;
    stage = "deliver_password_reset";
    const result = await issuePasswordResetForMember({
      member,
    });

    if (!result.ok) {
      if (result.reason === "missing_recovery_email") {
        return NextResponse.json(
          {
            error: "该账号尚未绑定找回邮箱，可先提交人工找回申请。",
            needsRecoveryRequest: true,
            reason: "missing_recovery_email",
          },
          { status: 400 }
        );
      }

      if (result.reason === "email_service_unavailable") {
        console.error("POST /api/auth/password/forgot email service unavailable", {
          missingConfig: result.missingConfig,
        });
        return NextResponse.json(
          {
            error: "邮件服务未配置，请提交人工找回申请。",
            needsRecoveryRequest: true,
            reason: "email_service_unavailable",
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        {
          error: "请求过于频繁，请 1 分钟后再试。",
          reason: "cooldown",
        },
        { status: 429 }
      );
    }

    await writeOperationLog({
      actorId: member.id,
      actorEmail: member.email,
      action: "password_reset_requested",
      targetType: "member",
      targetId: member.id,
      detail: JSON.stringify({ deliveryEmail: maskEmail(result.deliveryEmail) }),
    });

    return NextResponse.json({
      ok: true,
      message: GENERIC_SUCCESS_MESSAGE,
      reason: "email_sent",
      debugResetUrl:
        result.delivery.mode === "debug" && process.env.NODE_ENV !== "production"
          ? result.delivery.resetUrl
          : undefined,
    });
  } catch (error) {
    console.error("POST /api/auth/password/forgot", buildSafeErrorLog({
      eventCode: "PASSWORD_FORGOT_DELIVERY_FAILED",
      requestId,
      targetId,
      actorId: targetId,
      stage,
    }, error));
    return NextResponse.json(
      {
        error: "邮件发送失败，请稍后重试或提交人工找回申请。",
        needsRecoveryRequest: true,
        reason: "send_failed",
      },
      { status: 500 }
    );
  }
}
