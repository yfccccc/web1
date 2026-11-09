import Credential from "@alicloud/credentials";
import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { $OpenApiUtil } from "@alicloud/openapi-core";

const ALIYUN_SMS_ENDPOINT = "dysmsapi.aliyuncs.com";
const ALIYUN_SMS_SUCCESS_CODE = "OK";

type SendSmsResponseLike = {
  statusCode?: number;
  body?: {
    code?: string;
  };
};

type SendAliyunSmsInput = {
  phone: string;
  code: string;
  signName: string;
  templateCode: string;
};

function sanitizeProviderCode(value: unknown, fallback: string) {
  const code = typeof value === "string" ? value.trim() : "";
  const configuredCredentials = [
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  ].map((credential) => credential?.trim()).filter((credential): credential is string => Boolean(credential));
  if (configuredCredentials.some((credential) => code.includes(credential))) return fallback;
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(code) ? code : fallback;
}

function readProviderErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "ALIYUN_SDK_ERROR";
  return sanitizeProviderCode((error as { code?: unknown }).code, "ALIYUN_SDK_ERROR");
}

export class AliyunSmsProviderConfigurationError extends Error {
  readonly code = "BLOCKED_BY_SMS_PROVIDER_CONFIGURATION";

  constructor() {
    super("Aliyun SMS provider is not configured");
    this.name = "AliyunSmsProviderConfigurationError";
  }
}

export class AliyunSmsDeliveryError extends Error {
  readonly providerCode: string;

  constructor(providerCode: unknown) {
    super("Aliyun SMS provider rejected the request");
    this.name = "AliyunSmsDeliveryError";
    this.providerCode = sanitizeProviderCode(providerCode, "ALIYUN_RESPONSE_NOT_OK");
  }
}

export function isAliyunSendSmsSuccess(response: SendSmsResponseLike | null | undefined) {
  return response?.body?.code?.trim() === ALIYUN_SMS_SUCCESS_CODE;
}

function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new AliyunSmsProviderConfigurationError();
  }
}

function hasCredentialEnvironment() {
  return Boolean(
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim() &&
      process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim(),
  );
}

export async function sendAliyunSms(input: SendAliyunSmsInput) {
  assertServerRuntime();
  if (!hasCredentialEnvironment() || !input.signName.trim() || !input.templateCode.trim()) {
    throw new AliyunSmsProviderConfigurationError();
  }

  const config = new $OpenApiUtil.Config({
    credential: new Credential(),
    endpoint: ALIYUN_SMS_ENDPOINT,
    protocol: "https",
    regionId: "cn-hangzhou",
    connectTimeout: 5_000,
    readTimeout: 10_000,
  });
  const client = new Dysmsapi20170525(config);
  const request = new SendSmsRequest({
    phoneNumbers: input.phone,
    signName: input.signName,
    templateCode: input.templateCode,
    templateParam: JSON.stringify({ code: input.code }),
  });

  try {
    const response = await client.sendSms(request);
    if (!isAliyunSendSmsSuccess(response)) {
      throw new AliyunSmsDeliveryError(response.body?.code);
    }
  } catch (error) {
    if (error instanceof AliyunSmsProviderConfigurationError || error instanceof AliyunSmsDeliveryError) {
      throw error;
    }
    throw new AliyunSmsDeliveryError(readProviderErrorCode(error));
  }
}
