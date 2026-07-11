import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, requireAdminOrSuper } from "@/lib/session";
import { issuePasswordResetForMember, normalizeRecoveryEmail } from "@/lib/password-recovery";
import { writeOperationLog } from "@/lib/operation-log";
import { buildSafeErrorLog, maskEmail } from "@/lib/log-safety";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !requireAdminOrSuper(session)) {
    return NextResponse.json({ error: "仅管理员可操作。" }, { status: 403 });
  }
  const adminSession = session;
  const requestId = randomUUID();
  let targetId = "unresolved";
  let stage = "load_request";

  try {
    const { id } = await params;
    targetId = id;
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const adminNote = typeof body?.adminNote === "string" ? body.adminNote.trim().slice(0, 300) : null;
    const rawRecoveryEmail = typeof body?.recoveryEmail === "string" ? body.recoveryEmail : "";
    const recoveryEmail =
      rawRecoveryEmail.trim() === "" ? null : normalizeRecoveryEmail(rawRecoveryEmail.trim());

    if (rawRecoveryEmail.trim() && !recoveryEmail) {
      return NextResponse.json({ error: "找回邮箱格式不正确。" }, { status: 400 });
    }

    const recoveryRequest = await prisma.passwordRecoveryRequest.findUnique({
      where: { id },
      include: {
        member: {
          select: {
            id: true,
            email: true,
            recoveryEmail: true,
            passwordResetRequestedAt: true,
          },
        },
      },
    });

    if (!recoveryRequest) {
      return NextResponse.json({ error: "找回申请不存在。" }, { status: 404 });
    }

    if (action === "save") {
      stage = "save_recovery_request";
      const updated = await prisma.$transaction(async (tx) => {
        if (recoveryRequest.member && rawRecoveryEmail !== "") {
          await tx.member.update({
            where: { id: recoveryRequest.member.id },
            data: { recoveryEmail },
          });
        }

        return tx.passwordRecoveryRequest.update({
          where: { id },
          data: {
            status: recoveryRequest.status === "pending" ? "processing" : recoveryRequest.status,
            recoveryEmailSnapshot: rawRecoveryEmail !== "" ? recoveryEmail : recoveryRequest.recoveryEmailSnapshot,
            adminNote,
            handledById: adminSession.sub,
            handledAt: new Date(),
          },
        });
      });

      await writeOperationLog({
        actorId: adminSession.sub,
        actorEmail: adminSession.account,
        action: "password_recovery_request_saved",
        targetType: "password_recovery_request",
        targetId: id,
        detail: JSON.stringify({ recoveryEmail: maskEmail(recoveryEmail), hasAdminNote: Boolean(adminNote) }),
      });

      return NextResponse.json({ ok: true, item: updated });
    }

    if (action === "send_reset") {
      stage = "deliver_password_reset";
      if (!recoveryRequest.member) {
        return NextResponse.json({ error: "该申请未匹配到有效账号，无法发送重置链接。" }, { status: 400 });
      }

      const member =
        rawRecoveryEmail !== ""
          ? await prisma.member.update({
              where: { id: recoveryRequest.member.id },
              data: { recoveryEmail },
              select: {
                id: true,
                email: true,
                recoveryEmail: true,
                passwordResetRequestedAt: true,
              },
            })
          : recoveryRequest.member;

      const result = await issuePasswordResetForMember({
        member,
      });

      if (!result.ok) {
        const isMissingRecoveryEmail = result.reason === "missing_recovery_email";
        const isEmailServiceUnavailable = result.reason === "email_service_unavailable";

        if (isEmailServiceUnavailable) {
          console.error("PATCH /api/admin/password-recovery-requests/[id] email service unavailable", {
            missingConfig: result.missingConfig,
          });
        }

        return NextResponse.json(
          {
            error: isMissingRecoveryEmail
              ? "请先为该账号填写找回邮箱，再发送重置链接。"
              : isEmailServiceUnavailable
                ? "邮件服务未配置，请先补齐 SMTP 或 Resend 配置。"
                : "请求过于频繁，请稍后再试。",
            reason: result.reason,
          },
          { status: isMissingRecoveryEmail ? 400 : isEmailServiceUnavailable ? 503 : 429 }
        );
      }

      const updated = await prisma.passwordRecoveryRequest.update({
        where: { id },
        data: {
          status: "sent",
          adminNote,
          recoveryEmailSnapshot: result.deliveryEmail,
          handledById: adminSession.sub,
          handledAt: new Date(),
          lastSentAt: new Date(),
        },
      });

      await writeOperationLog({
        actorId: adminSession.sub,
        actorEmail: adminSession.account,
        action: "password_recovery_request_sent_reset",
        targetType: "password_recovery_request",
        targetId: id,
        detail: JSON.stringify({ deliveryEmail: maskEmail(result.deliveryEmail) }),
      });

      return NextResponse.json({
        ok: true,
        item: updated,
        reason: "email_sent",
        debugResetUrl:
          result.delivery.mode === "debug" && process.env.NODE_ENV !== "production"
            ? result.delivery.resetUrl
            : undefined,
      });
    }

    if (action === "resolve" || action === "reject") {
      stage = "resolve_recovery_request";
      const status = action === "resolve" ? "resolved" : "rejected";
      const updated = await prisma.passwordRecoveryRequest.update({
        where: { id },
        data: {
          status,
          adminNote,
          handledById: adminSession.sub,
          handledAt: new Date(),
        },
      });

      await writeOperationLog({
        actorId: adminSession.sub,
        actorEmail: adminSession.account,
        action: `password_recovery_request_${status}`,
        targetType: "password_recovery_request",
        targetId: id,
        detail: JSON.stringify({ hasAdminNote: Boolean(adminNote) }),
      });

      return NextResponse.json({ ok: true, item: updated });
    }

    return NextResponse.json({ error: "不支持的操作。" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/admin/password-recovery-requests/[id]", buildSafeErrorLog({
      eventCode: "PASSWORD_RECOVERY_ADMIN_UPDATE_FAILED",
      requestId,
      targetId,
      actorId: adminSession.sub,
      stage,
    }, error));
    return NextResponse.json(
      {
        error: "邮件发送失败或处理找回申请失败，请稍后重试。",
        reason: "send_failed",
      },
      { status: 500 }
    );
  }
}
