import { NextResponse } from "next/server";

const RATE_LIMIT_ERROR_MESSAGE = "请求过于频繁，请稍后再试";
const RATE_LIMIT_SWEEP_INTERVAL = 200;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitBucket>;

type ConsumeRateLimitInput = {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  maxBuckets?: number;
};

type ConsumeRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

declare global {
  var __basicRateLimitStore__: RateLimitStore | undefined;
  var __basicRateLimitSweepCount__: number | undefined;
}

function getRateLimitStore() {
  if (!globalThis.__basicRateLimitStore__) {
    globalThis.__basicRateLimitStore__ = new Map<string, RateLimitBucket>();
  }

  return globalThis.__basicRateLimitStore__;
}

function sweepExpiredBuckets(now: number) {
  const store = getRateLimitStore();
  const nextSweepCount = (globalThis.__basicRateLimitSweepCount__ ?? 0) + 1;
  globalThis.__basicRateLimitSweepCount__ = nextSweepCount;
  if (nextSweepCount % RATE_LIMIT_SWEEP_INTERVAL !== 0) return;

  store.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  });
}

function sweepExpiredBucketsNow(now: number) {
  const store = getRateLimitStore();
  store.forEach((bucket, key) => {
    if (bucket.resetAt <= now) store.delete(key);
  });
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstHop = forwardedFor.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const requestIp = (request as Request & { ip?: string | null }).ip?.trim();
  if (requestIp) return requestIp;

  return "unknown";
}

export function getTrustedClientIp(
  request: Request,
  trustProxyHeaders = process.env.TRUST_PROXY_HEADERS?.trim().toLowerCase() === "true",
): string | null {
  const requestIp = (request as Request & { ip?: string | null }).ip?.trim();
  if (requestIp) return requestIp;
  if (!trustProxyHeaders) return null;

  const firstHop = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (firstHop) return firstHop;
  return request.headers.get("x-real-ip")?.trim() || null;
}

export function consumeRateLimit(input: ConsumeRateLimitInput): ConsumeRateLimitResult {
  const now = Date.now();
  sweepExpiredBuckets(now);

  const key = `${input.scope}:${normalizeIdentifier(input.identifier)}`;
  const store = getRateLimitStore();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const scopePrefix = `${input.scope}:`;
    let scopeSize = 0;
    store.forEach((_value, key) => {
      if (key.startsWith(scopePrefix)) scopeSize += 1;
    });
    const maxBuckets = input.maxBuckets ?? Number.POSITIVE_INFINITY;
    if (scopeSize >= maxBuckets) {
      sweepExpiredBucketsNow(now);
      scopeSize = 0;
      store.forEach((_value, key) => {
        if (key.startsWith(scopePrefix)) scopeSize += 1;
      });
      if (scopeSize >= maxBuckets) {
        return { allowed: false, remaining: 0, retryAfterSec: 60 };
      }
    }
    store.set(key, {
      count: 1,
      resetAt: now + input.windowMs,
    });
    return {
      allowed: true,
      remaining: Math.max(input.limit - 1, 0),
      retryAfterSec: Math.max(Math.ceil(input.windowMs / 1000), 1),
    };
  }

  if (bucket.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1),
    };
  }

  bucket.count += 1;
  store.set(key, bucket);

  return {
    allowed: true,
    remaining: Math.max(input.limit - bucket.count, 0),
    retryAfterSec: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1),
  };
}

export function createRateLimitResponse(retryAfterSec = 60) {
  return NextResponse.json(
    { error: RATE_LIMIT_ERROR_MESSAGE },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(retryAfterSec, 1)),
      },
    }
  );
}

// Single-instance baseline only: restart clears state and multiple instances do
// not share counters. Any future shared limiter must use an app-specific namespace.
