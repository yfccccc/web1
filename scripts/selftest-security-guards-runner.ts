import { randomBytes } from "node:crypto";
import { buildEnterpriseInquiryDuplicateIdentifier, isCompatibleContactPhone, validateEnterpriseInquiry } from "../lib/enterprise-inquiry-validation";
import { checkEnterpriseInquiryRateLimits, ENTERPRISE_INQUIRY_LIMITS } from "../lib/enterprise-inquiry-rate-limit";
import { buildLegacyImportDryRunSummary, generateLegacyTemporaryPassword } from "../lib/legacy-import-safety";
import { buildSafeErrorLog, maskEmail, safeErrorSummary, sanitizeLogText } from "../lib/log-safety";
import { consumeRateLimit, getTrustedClientIp } from "../lib/rate-limit";

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`Assertion failed: ${name}`);
}

const valid = validateEnterpriseInquiry({
  enterpriseId: "enterprise-1",
  visitorName: "张先生",
  phone: "+86 138-0013-8000",
  demand: "希望了解企业服务。",
  wechat: "wechat_name",
});
assert("normal inquiry remains valid", valid.ok && !valid.honeypot);
assert("blank required field is rejected", !validateEnterpriseInquiry({ enterpriseId: "x", visitorName: " ", phone: "13800138000", demand: "x" }).ok);
assert("invalid phone is rejected", !validateEnterpriseInquiry({ enterpriseId: "x", visitorName: "a", phone: "phone", demand: "x" }).ok);
const honey = validateEnterpriseInquiry({ enterpriseId: "x", visitorName: "a", phone: "13800138000", demand: "x", website: "bot" });
assert("honeypot is detected", honey.ok && honey.honeypot);
assert("landline with area code and extension is valid", isCompatibleContactPhone("0571-12345678 转 123"));
assert("international number and ext is valid", isCompatibleContactPhone("+1 (212) 555-0188 ext 42"));
assert("html phone is rejected", !isCompatibleContactPhone("<b>13800138000</b>"));
assert("control characters are rejected", !isCompatibleContactPhone("1380013\n8000"));
assert("overlong phone is rejected", !isCompatibleContactPhone(`+86 ${"1".repeat(60)}`));

const spoofedRequest = new Request("https://build.invalid", { headers: { "x-forwarded-for": "203.0.113.9" } });
assert("untrusted proxy header is ignored", getTrustedClientIp(spoofedRequest, false) === null);
assert("trusted proxy header is accepted when explicitly enabled", getTrustedClientIp(spoofedRequest, true) === "203.0.113.9");

const contactValue = { ...(valid.ok ? valid.value : (() => { throw new Error("valid fixture failed"); })()), phone: `1380000${String(Date.now()).slice(-4)}` };
const secretOne = randomBytes(32);
const secretTwo = randomBytes(32);
const duplicateIdentifier = buildEnterpriseInquiryDuplicateIdentifier(contactValue, secretOne);
assert("duplicate identifier excludes raw phone", !duplicateIdentifier.includes(contactValue.phone));
assert("duplicate identifier is an HMAC digest", /^[a-f0-9]{64}$/.test(duplicateIdentifier));
assert("different HMAC secrets produce different identifiers", duplicateIdentifier !== buildEnterpriseInquiryDuplicateIdentifier(contactValue, secretTwo));
for (let index = 0; index < 8; index += 1) {
  assert("honeypot skips rate-limit quota", checkEnterpriseInquiryRateLimits({ request: new Request("https://build.invalid"), value: contactValue, honeypot: true, trustProxyHeaders: false, hmacSecret: secretOne }).allowed);
}
for (let index = 0; index < ENTERPRISE_INQUIRY_LIMITS.duplicate10m; index += 1) {
  assert("identical request within 10m boundary is allowed", checkEnterpriseInquiryRateLimits({ request: new Request("https://build.invalid"), value: contactValue, honeypot: false, trustProxyHeaders: false, hmacSecret: secretOne }).allowed);
}
assert("identical request over 10m boundary is rejected", !checkEnterpriseInquiryRateLimits({ request: new Request("https://build.invalid"), value: contactValue, honeypot: false, trustProxyHeaders: false, hmacSecret: secretOne }).allowed);
for (let index = 0; index < 8; index += 1) {
  const distinctValue = { ...contactValue, demand: `${contactValue.demand}-${index}` };
  assert("same phone with different content is not treated as a duplicate", checkEnterpriseInquiryRateLimits({ request: new Request("https://build.invalid"), value: distinctValue, honeypot: false, trustProxyHeaders: false, hmacSecret: secretOne }).allowed);
}

const originalDateNow = Date.now;
let simulatedNow = originalDateNow() + 48 * 60 * 60 * 1_000;
Date.now = () => simulatedNow;
try {
  const dailyValue = { ...contactValue, phone: `1390000${String(simulatedNow).slice(-4)}` };
  for (let index = 0; index < ENTERPRISE_INQUIRY_LIMITS.duplicate24h; index += 1) {
    assert("duplicate request within 24h boundary is allowed", checkEnterpriseInquiryRateLimits({ request: new Request("https://build.invalid"), value: dailyValue, honeypot: false, trustProxyHeaders: false, hmacSecret: secretTwo }).allowed);
    simulatedNow += 11 * 60 * 1_000;
  }
  assert("duplicate request over 24h boundary is rejected", !checkEnterpriseInquiryRateLimits({ request: new Request("https://build.invalid"), value: dailyValue, honeypot: false, trustProxyHeaders: false, hmacSecret: secretTwo }).allowed);
} finally {
  Date.now = originalDateNow;
}

assert("email is masked", maskEmail("zhangsan@example.com") === "zh***@example.com");
const sanitized = sanitizeLogText("note user@example.com phone 13800131234 token=secret-value\nnext");
assert("log email is masked", !sanitized.includes("user@example.com"));
assert("log phone is masked", sanitized.includes("138****1234"));
assert("log token is redacted", !sanitized.includes("secret-value"));
assert("error summary excludes message", !("message" in safeErrorSummary(new Error("password=secret"))));
const safeLog = buildSafeErrorLog({ eventCode: "SELFTEST_FAILED", requestId: "request-1", targetId: "target-1", actorId: "actor-1", stage: "selftest" }, new Error("token=secret-value"));
assert("safe log includes event code and request id", safeLog.eventCode === "SELFTEST_FAILED" && safeLog.requestId === "request-1");
assert("safe log excludes original error message", !JSON.stringify(safeLog).includes("secret-value"));

const temporaryOne = generateLegacyTemporaryPassword();
const temporaryTwo = generateLegacyTemporaryPassword();
assert("legacy temporary passwords are high entropy and non-deterministic", temporaryOne.length >= 32 && temporaryOne !== temporaryTwo);
const importSummary = buildLegacyImportDryRunSummary({
  legacyId: "legacy-1",
  memberId: null,
  account: "sensitive@example.com",
  usedLegacyPassword: false,
  passwordGenerated: true,
  memberTypeBefore: null,
  memberTypeAfter: "enterprise_basic",
  enterprisePatch: { contactPerson: "Sensitive Person", address: "Sensitive Address", companyName: "Example" },
  brandPatch: { name: "Example", contactPhone: "13800138000" },
  siteModules: { contact: true, news: true },
});
const serializedSummary = JSON.stringify(importSummary);
assert("import summary masks account", !serializedSummary.includes("sensitive@example.com"));
assert("import summary excludes sensitive object values", !serializedSummary.includes("Sensitive Person") && !serializedSummary.includes("13800138000"));
assert("import summary excludes generated password values", !serializedSummary.includes(temporaryOne));
assert("import summary records reset requirement", importSummary.passwordResetRequired === true);

const identifier = `security-selftest-${Date.now()}`;
assert("rate limit first request allowed", consumeRateLimit({ scope: "selftest", identifier, limit: 2, windowMs: 60_000 }).allowed);
assert("rate limit second request allowed", consumeRateLimit({ scope: "selftest", identifier, limit: 2, windowMs: 60_000 }).allowed);
assert("rate limit excess rejected", !consumeRateLimit({ scope: "selftest", identifier, limit: 2, windowMs: 60_000 }).allowed);

const capScope = `security-selftest-cap-${Date.now()}`;
const capClock = Date.now;
let capNow = capClock();
Date.now = () => capNow;
try {
  assert("rate-limit bucket cap allows first identifier", consumeRateLimit({ scope: capScope, identifier: "one", limit: 1, windowMs: 1_000, maxBuckets: 2 }).allowed);
  assert("rate-limit bucket cap allows second identifier", consumeRateLimit({ scope: capScope, identifier: "two", limit: 1, windowMs: 1_000, maxBuckets: 2 }).allowed);
  assert("rate-limit bucket cap rejects new identifiers while full", !consumeRateLimit({ scope: capScope, identifier: "three", limit: 1, windowMs: 1_000, maxBuckets: 2 }).allowed);
  capNow += 1_001;
  assert("expired buckets are cleaned before applying the cap", consumeRateLimit({ scope: capScope, identifier: "three", limit: 1, windowMs: 1_000, maxBuckets: 2 }).allowed);
} finally {
  Date.now = capClock;
}

console.log("security guard selftest passed");
