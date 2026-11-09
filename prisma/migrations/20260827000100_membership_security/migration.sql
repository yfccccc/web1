-- Preserve existing accounts as active. New self-registrations explicitly enter pending_review.
ALTER TABLE "members"
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "accountStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "realName" TEXT,
  ADD COLUMN IF NOT EXISTS "identityDocumentType" TEXT,
  ADD COLUMN IF NOT EXISTS "identityDocumentNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "identityDocumentFrontPath" TEXT,
  ADD COLUMN IF NOT EXISTS "identityDocumentBackPath" TEXT,
  ADD COLUMN IF NOT EXISTS "region" TEXT,
  ADD COLUMN IF NOT EXISTS "occupationType" TEXT,
  ADD COLUMN IF NOT EXISTS "companyOrOrganization" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "agreedToTermsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "agreedToPrivacyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

CREATE INDEX IF NOT EXISTS "members_accountStatus_idx" ON "members"("accountStatus");

CREATE TABLE IF NOT EXISTS "sms_verifications" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "verifiedAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sms_verifications_phone_purpose_createdAt_idx"
  ON "sms_verifications"("phone", "purpose", "createdAt");
CREATE INDEX IF NOT EXISTS "sms_verifications_expiresAt_idx" ON "sms_verifications"("expiresAt");
