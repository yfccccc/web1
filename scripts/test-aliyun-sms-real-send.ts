import { randomInt } from "node:crypto";
import {
  AliyunSmsDeliveryError,
  AliyunSmsProviderConfigurationError,
  sendAliyunSms,
} from "../lib/aliyun-sms-provider";
import { isValidMemberPhone, normalizeMemberPhone } from "../lib/member-phone";

const REQUIRED_CONFIRMATION = "SEND_ONE_TEST_SMS";

function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

async function main() {
  if (process.env.ALIYUN_SMS_REAL_SEND_CONFIRM !== REQUIRED_CONFIRMATION) {
    throw new Error("REAL_SEND_CONFIRMATION_REQUIRED");
  }
  if (process.env.SMS_PROVIDER?.trim().toLowerCase() !== "aliyun") {
    throw new AliyunSmsProviderConfigurationError();
  }

  const phone = normalizeMemberPhone(process.env.ALIYUN_SMS_TEST_PHONE);
  if (!isValidMemberPhone(phone)) throw new Error("INVALID_PHONE");
  const signName = process.env.SMS_SIGN_NAME?.trim() ?? "";
  const templateCode = process.env.SMS_TEMPLATE_CODE?.trim() ?? "";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  await sendAliyunSms({ phone, code, signName, templateCode });
  console.log("ALIYUN_SMS_REAL_SEND_REQUEST=ACCEPTED");
  console.log(`ALIYUN_SMS_TEST_PHONE=${maskPhone(phone)}`);
  console.log("ALIYUN_SMS_TEST_CODE_LOGGED=NO");
}

main().catch((error) => {
  if (error instanceof AliyunSmsProviderConfigurationError) {
    console.error("ALIYUN_SMS_REAL_SEND_REQUEST=BLOCKED_BY_SMS_PROVIDER_CONFIGURATION");
  } else if (error instanceof AliyunSmsDeliveryError) {
    console.error(`ALIYUN_SMS_REAL_SEND_REQUEST=REJECTED PROVIDER_CODE=${error.providerCode}`);
  } else if (error instanceof Error && ["INVALID_PHONE", "REAL_SEND_CONFIRMATION_REQUIRED"].includes(error.message)) {
    console.error(`ALIYUN_SMS_REAL_SEND_REQUEST=${error.message}`);
  } else {
    console.error("ALIYUN_SMS_REAL_SEND_REQUEST=FAILED_SAFE");
  }
  process.exitCode = 1;
});
