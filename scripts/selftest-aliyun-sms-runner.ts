import bcrypt from "bcryptjs";

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`Assertion failed: ${name}`);
}

async function expectReject(name: string, action: () => Promise<unknown>, check: (error: unknown) => boolean) {
  try {
    await action();
  } catch (error) {
    assert(name, check(error));
    return;
  }
  throw new Error(`Assertion failed: ${name}`);
}

type VerificationData = {
  phone: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

const prismaPath = require.resolve("../lib/prisma");
let createdData: VerificationData | null = null;
let activationData: { data?: { usedAt?: Date | null } } | null = null;
let databaseCallCount = 0;
let findFirstResult: Record<string, unknown> | null = null;
let countResult = 0;
let findFirstInputs: Array<Record<string, unknown>> = [];
let updateInputs: Array<Record<string, unknown>> = [];
let updateManyCountQueue: number[] = [];
const fakePrisma = {
  smsVerification: {
    findFirst: async (input: Record<string, unknown>) => {
      databaseCallCount += 1;
      findFirstInputs.push(input);
      return findFirstResult;
    },
    count: async () => {
      databaseCallCount += 1;
      return countResult;
    },
    create: async ({ data }: { data: VerificationData }) => {
      databaseCallCount += 1;
      createdData = data;
      return { id: `sms-test-${databaseCallCount}` };
    },
    updateMany: async (input: { data?: { usedAt?: Date | null } }) => {
      databaseCallCount += 1;
      activationData = input;
      return { count: updateManyCountQueue.shift() ?? 1 };
    },
    update: async (input: Record<string, unknown>) => {
      databaseCallCount += 1;
      updateInputs.push(input);
      return { id: `sms-test-${databaseCallCount}` };
    },
  },
};
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: fakePrisma },
  children: [],
  paths: [],
} as unknown as NodeModule;

const providerModule = require("../lib/aliyun-sms-provider") as typeof import("../lib/aliyun-sms-provider");
assert("Aliyun OK business response is accepted", providerModule.isAliyunSendSmsSuccess({ statusCode: 200, body: { code: "OK" } }));
assert("Aliyun success code is matched strictly", !providerModule.isAliyunSendSmsSuccess({ statusCode: 200, body: { code: "ok" } }));
assert("HTTP 200 with Aliyun business error is rejected", !providerModule.isAliyunSendSmsSuccess({ statusCode: 200, body: { code: "isv.SMS_SIGNATURE_ILLEGAL" } }));
assert("empty Aliyun response is rejected", !providerModule.isAliyunSendSmsSuccess({ statusCode: 200 }));
assert(
  "provider error code is sanitized",
  new providerModule.AliyunSmsDeliveryError("unsafe code contains credential material").providerCode === "ALIYUN_RESPONSE_NOT_OK",
);

let delivered: { phone: string; code: string } | null = null;
let deliveryFailure = false;
providerModule.sendAliyunSms = async (input) => {
  assert("OTP is persisted as unusable before provider call", createdData?.usedAt instanceof Date);
  delivered = { phone: input.phone, code: input.code };
  if (deliveryFailure) throw new providerModule.AliyunSmsDeliveryError("isv.BUSINESS_LIMIT_CONTROL");
};

const smsModule = require("../lib/sms-verification") as typeof import("../lib/sms-verification");
const envNames = [
  "SMS_PROVIDER",
  "SMS_SIGN_NAME",
  "SMS_TEMPLATE_CODE",
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
] as const;
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

function configureFakeAliyunEnvironment() {
  process.env.SMS_PROVIDER = "aliyun";
  process.env.SMS_SIGN_NAME = "单元测试签名";
  process.env.SMS_TEMPLATE_CODE = "SMS_UNIT_TEST_ONLY";
  process.env.ALIBABA_CLOUD_ACCESS_KEY_ID = ["unit", "only", "id"].join("-");
  process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET = ["unit", "only", "credential"].join("-");
}

async function run() {
  try {
    for (const name of envNames) delete process.env[name];
    const callsBeforeMissingConfig = databaseCallCount;
    await expectReject(
      "missing credentials fail safely before database access",
      () => smsModule.sendRegistrationSms("13800138000", "198.51.100.10"),
      (error) => error instanceof smsModule.SmsProviderConfigurationError && error.code === "BLOCKED_BY_SMS_PROVIDER_CONFIGURATION",
    );
    assert("missing credentials do not access database", databaseCallCount === callsBeforeMissingConfig);

    configureFakeAliyunEnvironment();
    assert(
      "configured credential material is never accepted as a loggable provider code",
      new providerModule.AliyunSmsDeliveryError(process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET).providerCode === "ALIYUN_RESPONSE_NOT_OK",
    );
    const callsBeforeInvalidPhone = databaseCallCount;
    await expectReject(
      "invalid mainland phone is blocked before provider call",
      () => smsModule.sendRegistrationSms("123456", "198.51.100.11"),
      (error) => error instanceof Error && error.message === "INVALID_PHONE",
    );
    assert("invalid phone does not access database", databaseCallCount === callsBeforeInvalidPhone);

    findFirstResult = { id: "cooldown-record" };
    countResult = 0;
    delivered = null;
    await expectReject(
      "resend cooldown blocks delivery",
      () => smsModule.sendRegistrationSms("13800138003", "198.51.100.14"),
      (error) => error instanceof Error && error.message === "RESEND_COOLDOWN",
    );
    assert("resend cooldown does not call provider", delivered === null);

    findFirstResult = null;
    countResult = 10;
    await expectReject(
      "daily send limit blocks delivery",
      () => smsModule.sendRegistrationSms("13800138004", "198.51.100.15"),
      (error) => error instanceof Error && error.message === "DAILY_LIMIT",
    );
    assert("daily send limit does not call provider", delivered === null);

    findFirstResult = null;
    countResult = 0;
    createdData = null;
    activationData = null;
    delivered = null;
    deliveryFailure = false;
    await smsModule.sendRegistrationSms("13800138001", "198.51.100.12");
    const successfulDelivery = delivered as { phone: string; code: string } | null;
    const successfulRecord = createdData as VerificationData | null;
    const successfulActivation = activationData as { data?: { usedAt?: Date | null } } | null;
    assert("provider receives normalized phone", successfulDelivery?.phone === "13800138001");
    assert("provider receives generated six digit OTP", /^\d{6}$/.test(successfulDelivery?.code ?? ""));
    assert("database stores only OTP hash", Boolean(successfulRecord && successfulDelivery && successfulRecord.codeHash !== successfulDelivery.code));
    assert("stored OTP hash verifies generated OTP", Boolean(successfulRecord && successfulDelivery && (await bcrypt.compare(successfulDelivery.code, successfulRecord.codeHash))));
    assert("successful provider response activates OTP", successfulActivation?.data?.usedAt === null);

    createdData = null;
    activationData = null;
    delivered = null;
    deliveryFailure = true;
    const originalConsoleError = console.error;
    const errorLogs: unknown[][] = [];
    console.error = (...args: unknown[]) => errorLogs.push(args);
    try {
      await expectReject(
        "Aliyun business failure is not treated as success",
        () => smsModule.sendRegistrationSms("13800138002", "198.51.100.13"),
        (error) => error instanceof Error && error.message === "SMS_PROVIDER_REJECTED",
      );
    } finally {
      console.error = originalConsoleError;
    }
    const failedRecord = createdData as VerificationData | null;
    const failedDelivery = delivered as { phone: string; code: string } | null;
    assert("failed delivery record remains unusable", failedRecord?.usedAt instanceof Date && activationData === null);
    const serializedLogs = JSON.stringify(errorLogs);
    assert("failure log masks phone", serializedLogs.includes("138****8002") && !serializedLogs.includes("13800138002"));
    assert("failure log excludes OTP", !serializedLogs.includes(failedDelivery?.code ?? ""));
    assert("failure log records only safe provider code", serializedLogs.includes("isv.BUSINESS_LIMIT_CONTROL"));

    const verificationCode = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    let incorrectCode = String((Number(verificationCode) + 1) % 1_000_000).padStart(6, "0");
    if (incorrectCode === verificationCode) incorrectCode = String((Number(verificationCode) + 2) % 1_000_000).padStart(6, "0");
    const codeHash = await bcrypt.hash(verificationCode, 4);

    findFirstInputs = [];
    findFirstResult = null;
    assert("expired OTP cannot verify", !(await smsModule.verifyRegistrationSms("13800138005", verificationCode)));
    const expiryQuery = findFirstInputs.at(-1) as { where?: { expiresAt?: { gt?: unknown } } } | undefined;
    assert("OTP lookup enforces a future expiration", expiryQuery?.where?.expiresAt?.gt instanceof Date);

    updateInputs = [];
    findFirstResult = { id: "incorrect-record", attemptCount: 0, codeHash };
    assert("incorrect OTP is rejected", !(await smsModule.verifyRegistrationSms("13800138005", incorrectCode)));
    const attemptUpdate = updateInputs.at(-1) as { data?: { attemptCount?: { increment?: number } } } | undefined;
    assert("incorrect OTP increments attempt count", attemptUpdate?.data?.attemptCount?.increment === 1);

    updateInputs = [];
    findFirstResult = { id: "locked-record", attemptCount: 5, codeHash };
    assert("OTP at maximum attempts is rejected", !(await smsModule.verifyRegistrationSms("13800138005", verificationCode)));
    assert("locked OTP is not updated", updateInputs.length === 0);

    updateInputs = [];
    findFirstResult = { id: "valid-record", attemptCount: 0, codeHash };
    assert("valid OTP verifies", await smsModule.verifyRegistrationSms("13800138005", verificationCode));
    const verifiedUpdate = updateInputs.at(-1) as { data?: { verifiedAt?: unknown } } | undefined;
    assert("successful verification records verification time", verifiedUpdate?.data?.verifiedAt instanceof Date);

    findFirstResult = { id: "verified-record", verifiedAt: new Date(), usedAt: null };
    updateManyCountQueue = [1, 0];
    assert("verified OTP is consumed once", await smsModule.consumeVerifiedRegistrationSms("13800138005"));
    assert("consumed OTP cannot be reused", !(await smsModule.consumeVerifiedRegistrationSms("13800138005")));
  } finally {
    for (const name of envNames) {
      const original = originalEnv[name];
      if (typeof original === "string") process.env[name] = original;
      else delete process.env[name];
    }
  }
}

run()
  .then(() => {
    console.log("SMS_UNCONFIGURED_SAFE_FAILURE_TEST=PASS");
    console.log("SMS_RATE_LIMIT_TEST=PASS");
    console.log("OTP_EXPIRY_TEST=PASS");
    console.log("OTP_REUSE_TEST=PASS");
    console.log("OTP_ERROR_LIMIT_TEST=PASS");
    console.log("ALIYUN_SMS_PROVIDER_SAFETY_TESTS=PASS");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
