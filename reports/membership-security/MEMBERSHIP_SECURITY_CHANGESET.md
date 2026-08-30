# Membership Security Changeset

Status: final production release candidate; isolated from the unrelated primary working tree and based on production HEAD `b1a181e0076262fd79f688d20a912601a9a00435`.

The 18 files below are the membership-security runtime closure. Their changed code does not require any uncommitted work outside this list: the production baseline already provides the pre-existing exports used by the member article routes (`normalizeRichTextField`, `getEffectiveMemberAccessForMember`, and `MEMBER_ALLOWED_CATEGORY_HREFS`).

| File | Purpose | Source | Migration | Test | UI | Required for deployment | Database structure |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `app/api/admin/members/route.ts` | Safe admin account-list review metadata and article counts | Yes | No | No | No | Yes | No |
| `app/api/admin/members/[id]/route.ts` | Account-review status transition metadata | Yes | No | No | No | Yes | No |
| `app/api/admin/members/[id]/identity-documents/[side]/route.ts` | Admin-only private identity-document read endpoint | Yes | No | No | No | Yes | No |
| `app/api/auth/register/route.ts` | Verified-phone, identity-data and pending-review registration gate | Yes | No | No | No | Yes | No |
| `app/api/auth/sms/send/route.ts` | Server-side SMS send endpoint with safe unavailable-provider response | Yes | No | No | No | Yes | No |
| `app/api/auth/sms/verify/route.ts` | Server-side OTP verification endpoint | Yes | No | No | No | Yes | No |
| `app/api/member/articles/route.ts` | Create-time approval, quota and forced-category enforcement | Yes | No | No | No | Yes | No |
| `app/api/member/articles/[id]/route.ts` | Update-time forced-category enforcement | Yes | No | No | No | Yes | No |
| `app/membership/register/page.tsx` | Registration, SMS and private-document form UI | Yes | No | No | Yes | Yes | No |
| `app/membership/admin/accounts/page.tsx` | Account review metadata, controlled document links and approve/reject actions | Yes | No | No | Yes | Yes | No |
| `lib/identity-documents.ts` | Non-public identity-document storage/path validation | Yes | No | No | No | Yes | No |
| `lib/member-access-resolver.ts` | Restrictive member-category resolution | Yes | No | No | No | Yes | No |
| `lib/membership-publishing.ts` | Central personal/basic quota and category policy | Yes | No | Yes | No | Yes | No |
| `lib/membership-rules.ts` | Safe default member publishing categories | Yes | No | No | No | Yes | No |
| `lib/session.ts` | Session propagation of review and phone-verification state | Yes | No | No | No | Yes | No |
| `lib/sms-verification.ts` | OTP hashing, expiry, one-use and provider abstraction | Yes | No | Yes | No | Yes | No |
| `prisma/schema.prisma` | Member review/identity fields and OTP model | Yes | Yes | No | No | Yes | Yes |
| `prisma/migrations/20260827000100_membership_security/migration.sql` | Additive member/OTP schema migration | No | Yes | No | No | Yes | Yes |

No database backup, identity document, environment file, or SMS credential is part of this changeset.

## Aliyun SMS integration extension

The following files complete the provider integration without changing the frozen membership rules above:

| File | Purpose | Required for deployment |
| --- | --- | ---: |
| `.env.example` | Documents server-only variable names with empty credentials | Yes |
| `lib/aliyun-sms-provider.ts` | Official Aliyun client, strict business-response handling, safe errors | Yes |
| `package.json` | Official SDK dependencies and gated validation commands | Yes |
| `package-lock.json` | Node 20 reproducible dependency lock | Yes |
| `scripts/selftest-aliyun-sms.js` | Node self-test entry point | Validation |
| `scripts/selftest-aliyun-sms-runner.ts` | No-secret provider, persistence, rate-limit and OTP safety tests | Validation |
| `scripts/test-aliyun-sms-real-send.ts` | Explicitly gated, single-message isolated acceptance command | Validation |
| `scripts/selftest-membership-security.ts` | Pending-review, quota, forced-category, review-flow and private-storage guards | Validation |
| `reports/membership-security/SECRET_CONFIGURATION_INSTRUCTIONS.md` | Non-echoing, atomic secret configuration procedure | Operations |
| `reports/membership-security/ALIYUN_SMS_INTEGRATION_20260830.md` | Evidence and deferred production boundary | Audit |

`lib/sms-verification.ts` is already in the base table and is the only frozen membership file modified for provider delivery. No additional Prisma schema or migration change was introduced for Aliyun SMS.

## Final frozen file set

The final isolated release commit contains exactly 30 files:

1. `.env.example`
2. `app/api/admin/members/[id]/route.ts`
3. `app/api/admin/members/[id]/identity-documents/[side]/route.ts`
4. `app/api/admin/members/route.ts`
5. `app/api/auth/register/route.ts`
6. `app/api/auth/sms/send/route.ts`
7. `app/api/auth/sms/verify/route.ts`
8. `app/api/member/articles/[id]/route.ts`
9. `app/api/member/articles/route.ts`
10. `app/membership/register/page.tsx`
11. `app/membership/admin/accounts/page.tsx`
12. `lib/identity-documents.ts`
13. `lib/member-access-resolver.ts`
14. `lib/membership-publishing.ts`
15. `lib/membership-rules.ts`
16. `lib/session.ts`
17. `lib/sms-verification.ts`
18. `lib/aliyun-sms-provider.ts`
19. `prisma/schema.prisma`
20. `prisma/migrations/20260827000100_membership_security/migration.sql`
21. `package.json`
22. `package-lock.json`
23. `scripts/selftest-aliyun-sms.js`
24. `scripts/selftest-aliyun-sms-runner.ts`
25. `scripts/test-aliyun-sms-real-send.ts`
26. `scripts/selftest-membership-security.ts`
27. `reports/membership-security/SECRET_CONFIGURATION_INSTRUCTIONS.md`
28. `reports/membership-security/ALIYUN_SMS_INTEGRATION_20260830.md`
29. `reports/membership-security/MEMBERSHIP_SECURITY_CHANGESET.md`
30. `reports/schema-drift/HISTORICAL_SCHEMA_DRIFT_AUDIT.md`

## Existing review flow

The changeset does not create or replace an article review system. Member submissions continue to use the existing `defaultContentStatusForSubmission` path, which produces `pending` for ordinary members. Neither member create nor member update accepts a caller-provided article status.

## Isolation finding

`MEMBERSHIP_SECURITY_DEPENDS_ON_UNRELATED_FILES=NO` for changes introduced by this changeset. The routes retain pre-existing imports from core content helpers, but the referenced symbols exist in `HEAD`; their current unrelated modifications are not required for this security behavior.
