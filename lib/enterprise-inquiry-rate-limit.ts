import { randomBytes } from "node:crypto";
import type { EnterpriseInquiryInput } from "@/lib/enterprise-inquiry-validation";
import { buildEnterpriseInquiryDuplicateIdentifier } from "@/lib/enterprise-inquiry-validation";
import { consumeRateLimit, getTrustedClientIp } from "@/lib/rate-limit";

const TEN_MINUTES_MS = 10 * 60 * 1_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
export const ENTERPRISE_INQUIRY_LIMITS = { ip10m: 20, ip24h: 100, duplicate10m: 3, duplicate24h: 20 } as const;
const MAX_BUCKETS_PER_SCOPE = 5_000;
const PROCESS_HMAC_SECRET = randomBytes(32);

export function checkEnterpriseInquiryRateLimits(input: {
  request: Request;
  value: EnterpriseInquiryInput;
  honeypot: boolean;
  trustProxyHeaders?: boolean;
  hmacSecret?: Uint8Array;
}) {
  if (input.honeypot) return { allowed: true, skipped: "honeypot" as const, retryAfterSec: 0 };

  const duplicateIdentifier = buildEnterpriseInquiryDuplicateIdentifier(input.value, input.hmacSecret ?? PROCESS_HMAC_SECRET);
  const duplicateResults = [
    consumeRateLimit({ scope: "cnzhengmu:enterprise-inquiry:duplicate:10m", identifier: duplicateIdentifier, limit: ENTERPRISE_INQUIRY_LIMITS.duplicate10m, windowMs: TEN_MINUTES_MS, maxBuckets: MAX_BUCKETS_PER_SCOPE }),
    consumeRateLimit({ scope: "cnzhengmu:enterprise-inquiry:duplicate:24h", identifier: duplicateIdentifier, limit: ENTERPRISE_INQUIRY_LIMITS.duplicate24h, windowMs: ONE_DAY_MS, maxBuckets: MAX_BUCKETS_PER_SCOPE }),
  ];
  const blockedDuplicate = duplicateResults.find((item) => !item.allowed);
  if (blockedDuplicate) return { allowed: false, skipped: null, retryAfterSec: blockedDuplicate.retryAfterSec };

  const clientIp = getTrustedClientIp(input.request, input.trustProxyHeaders);
  if (!clientIp) return { allowed: true, skipped: "ip_unavailable" as const, retryAfterSec: 0 };

  const ipResults = [
    consumeRateLimit({ scope: "cnzhengmu:enterprise-inquiry:ip:10m", identifier: clientIp, limit: ENTERPRISE_INQUIRY_LIMITS.ip10m, windowMs: TEN_MINUTES_MS, maxBuckets: MAX_BUCKETS_PER_SCOPE }),
    consumeRateLimit({ scope: "cnzhengmu:enterprise-inquiry:ip:24h", identifier: clientIp, limit: ENTERPRISE_INQUIRY_LIMITS.ip24h, windowMs: ONE_DAY_MS, maxBuckets: MAX_BUCKETS_PER_SCOPE }),
  ];
  const blockedIp = ipResults.find((item) => !item.allowed);
  return blockedIp
    ? { allowed: false, skipped: null, retryAfterSec: blockedIp.retryAfterSec }
    : { allowed: true, skipped: null, retryAfterSec: 0 };
}
