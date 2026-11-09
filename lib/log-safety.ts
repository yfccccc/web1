const EMAIL_PATTERN = /\b([A-Z0-9._%+-])[^\s@]*@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const PHONE_PATTERN = /(?<!\d)(1\d{2})[\s-]?\d{4}[\s-]?(\d{4})(?!\d)/g;
const TOKEN_PATTERN = /\b(token|authorization|cookie|password|secret)\b\s*[:=]\s*[^\s,;]+/gi;
const URL_SECRET_PATTERN = /([?&](?:token|code|key|secret|password)=)[^&#\s]+/gi;

export function maskEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return normalized ? "***" : "";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function sanitizeLogText(value: string | null | undefined, maxLength = 160) {
  if (!value) return "";
  const bounded = value.slice(0, Math.max(maxLength * 4, 1_024));
  return bounded
    .replace(/[\r\n\t]+/g, " ")
    .replace(EMAIL_PATTERN, (_match, first: string, domain: string) => `${first}***@${domain}`)
    .replace(PHONE_PATTERN, "$1****$2")
    .replace(TOKEN_PATTERN, "$1=[REDACTED]")
    .replace(URL_SECRET_PATTERN, "$1[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function safeErrorSummary(error: unknown) {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return {
      name: sanitizeLogText(error.name, 60) || "Error",
      code: typeof code === "string" || typeof code === "number" ? sanitizeLogText(String(code), 60) : undefined,
    };
  }
  return { name: "UnknownError" };
}

export function buildSafeErrorLog(
  context: { eventCode: string; requestId: string; stage: string; targetId?: string | null; actorId?: string | null },
  error: unknown,
) {
  const summary = safeErrorSummary(error);
  return {
    eventCode: sanitizeLogText(context.eventCode, 80),
    requestId: sanitizeLogText(context.requestId, 80),
    stage: sanitizeLogText(context.stage, 80),
    targetId: context.targetId ? sanitizeLogText(context.targetId, 80) : undefined,
    actorId: context.actorId ? sanitizeLogText(context.actorId, 80) : undefined,
    errorName: summary.name,
    errorCode: summary.code,
    timestamp: new Date().toISOString(),
  };
}
