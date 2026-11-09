import { randomBytes } from "node:crypto";
import { maskEmail } from "@/lib/log-safety";

export function generateLegacyTemporaryPassword() {
  return randomBytes(24).toString("base64url");
}

export function listLegacyImportDefinedFields(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, fieldValue]) => fieldValue !== null && fieldValue !== undefined && fieldValue !== "")
    .map(([key]) => key)
    .sort();
}

export function buildLegacyImportDryRunSummary(input: {
  legacyId: string;
  memberId: string | null;
  account: string;
  usedLegacyPassword: boolean;
  passwordGenerated: boolean;
  memberTypeBefore: string | null;
  memberTypeAfter: string;
  enterprisePatch: Record<string, unknown>;
  brandPatch: Record<string, unknown>;
  siteModules?: Record<string, boolean> | null;
}) {
  return {
    mode: "dry-run" as const,
    legacyId: input.legacyId,
    memberId: input.memberId,
    account: maskEmail(input.account),
    usedLegacyPassword: input.usedLegacyPassword,
    passwordGenerated: input.passwordGenerated,
    passwordResetRequired: input.passwordGenerated,
    memberTypeBefore: input.memberTypeBefore,
    memberTypeAfter: input.memberTypeAfter,
    enterpriseFields: listLegacyImportDefinedFields(input.enterprisePatch),
    brandFields: listLegacyImportDefinedFields(input.brandPatch),
    enabledSiteModules: Object.entries(input.siteModules ?? {}).filter(([, enabled]) => enabled).map(([key]) => key),
  };
}
