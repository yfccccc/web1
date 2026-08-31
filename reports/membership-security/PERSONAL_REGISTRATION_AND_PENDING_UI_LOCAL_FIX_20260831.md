# Personal registration and pending-review UI local fix

Date: 2026-08-31
Project: web1
Production baseline: `65a07b94898afb50ec2d9e179bb404d1eda6885f`
Execution boundary: local fix only

## 1. Objective

This changeset stops all new personal-member collection of identity-document numbers and identity-document images, while retaining phone/SMS verification, real name, necessary non-sensitive profile fields, agreements, `pending_review`, administrator account review, publishing quotas, forced enterprise-news placement, and article review. It also prevents a pending, rejected, suspended, disabled, or otherwise unapproved personal member from seeing the publish form.

## 2. Version context

`VERSION_CONTEXT_RETRIEVAL_COMPLETE=YES`
`RECENT_CONTEXT_RESTORED=YES`
`RELEVANT_HISTORICAL_VERSION_COUNT=11`
`CURRENT_TASK_CONFLICT_WITH_HISTORY=NO`

The recent incomplete business-acceptance record and the underlying reports/source history were inspected before editing. The new decision changes only new personal-registration data collection and the client-side publish gate. It does not change SMS security, quotas, administrator review authority, article review, production state, or historical identity-data handling.

## 3. Related versions

1. Incomplete `MEMBERSHIP_SECURITY_FINAL_BUSINESS_ACCEPTANCE` record.
2. `ZHUIJIA_DUAL_ACCOUNT_IDENTITY_AND_QUOTA_RESTORATION_20260831.md`.
3. `SPECIAL_ENTERPRISE_PUBLISHING_QUOTA_RESTORATION_20260831.md`.
4. `MEMBERSHIP_SECURITY_PRODUCTION_DEPLOYMENT_20260830.md`.
5. `MEMBERSHIP_SECURITY_VERSION_CONTEXT_CONFLICT_20260830.md`.
6. `MEMBERSHIP_SECURITY_CHANGESET.md`.
7. `ALIYUN_SMS_INTEGRATION_20260830.md`.
8. Source commit `d4c5529` (registration, publishing guards, SMS integration).
9. Source commit `a92444b` (enterprise-basic administrator overrides).
10. Source commit `a3b102d` (verified special enterprise quotas).
11. Exact baseline commit `65a07b9` (dual-account quota restoration).

## 4. Secure acceptance window termination

The previous real-registration acceptance helper was stopped before any phone input was supplied. Its process is no longer running, its temporary helper was removed, and it was not reopened. A production read-only check found no matching test member and no matching test article.

`CURRENT_SECURE_ACCEPTANCE_WINDOW_ABORTED=YES`
`SMS_SEND_COUNT_BEFORE_ABORT=0`
`TEST_MEMBER_CREATED_BEFORE_ABORT=NO`
`TEST_ARTICLE_CREATED_BEFORE_ABORT=NO`

Reason: registration data minimization and the pending-review UI gate had to be fixed before any new real acceptance activity.

## 5. Identity-collection audit and old design

Before this fix, the personal registration UI required an identity-document number plus front and back images. The registration API parsed, validated, stored, and linked those fields. The administrator approval API itself did not require identity data. The database fields were already nullable.

`ID_NUMBER_REQUIRED_IN_UI_BEFORE=YES`
`ID_NUMBER_REQUIRED_IN_API_BEFORE=YES`
`ID_FRONT_REQUIRED_IN_UI_BEFORE=YES`
`ID_FRONT_REQUIRED_IN_API_BEFORE=YES`
`ID_BACK_REQUIRED_IN_UI_BEFORE=YES`
`ID_BACK_REQUIRED_IN_API_BEFORE=YES`
`IDENTITY_FIELDS_NULLABLE_IN_DB=YES`
`ADMIN_APPROVAL_REQUIRES_IDENTITY=NO`
`IDENTITY_UPLOAD_OTHER_CALLERS=NONE`

The only remaining identity-document route is the existing controlled administrator read path for legacy data.

## 6. New data-minimization design

The registration page no longer renders identity-number or identity-image controls and no longer adds those values to the multipart payload. The registration API no longer reads, validates, stores, updates, or deletes identity-document files. It omits all four nullable identity fields when creating a personal member, so the database uses `NULL`; no placeholder is written.

`PERSONAL_PHONE_REQUIRED=YES`
`PERSONAL_SMS_VERIFICATION_REQUIRED=YES`
`PERSONAL_REAL_NAME_REQUIRED=YES`
`PERSONAL_AGREEMENT_REQUIRED=YES`
`PERSONAL_ADMIN_REVIEW_REQUIRED=YES`
`PERSONAL_ID_NUMBER_REQUIRED=NO`
`PERSONAL_ID_FRONT_REQUIRED=NO`
`PERSONAL_ID_BACK_REQUIRED=NO`
`NEW_PERSONAL_IDENTITY_COLLECTION=NO`
`EXISTING_IDENTITY_DATA_MODIFIED=NO`
`LEGACY_IDENTITY_DATA_SUPPORTED=YES`

New personal members still receive `memberType=personal`, `phoneVerified=true`, and `accountStatus=pending_review`; they are not automatically activated.

## 7. Administrator review and historical compatibility

The existing administrator transition from `pending_review` to `active` remains available without identity data. The accounts page continues to show the real name, verified phone state, registration time, non-sensitive registration fields, and account status. Legacy identity metadata and controlled read links appear only when historical data exists; a new personal member instead receives a clear “not collected” explanation.

`ADMIN_REVIEW_WITHOUT_IDENTITY_DATA=PASS`

No historical identity number, image, path, or record was deleted or cleared.

## 8. Pending-review UI defect and root cause

`PUBLISH_UI_ROUTE=/membership/content/publish`
`PUBLISH_UI_COMPONENT=PublishCenterPageInner`
`CURRENT_UI_PERMISSION_CHECK_BEFORE=authentication-only; no accountStatus/phoneVerified gate`
`CURRENT_API_PERMISSION_CHECK=assertRestrictedMemberCanSubmit`
`UI_API_PERMISSION_LOGIC_DIVERGENCE_BEFORE=YES`

The publish API already rejected personal members whose account was not active, but `/api/auth/me` did not expose the required status values and the page rendered the complete form after authentication. That created a real UI/API divergence.

The fix exposes `phoneVerified` and `accountStatus` through the existing authenticated member payloads and wraps the full publish UI in `MemberPublishAccessBoundary`. The boundary is fail-closed for personal accounts, matches server ordering, renders the exact pending-review message, and renders no form children or submit control while blocked. Rejected, suspended, disabled, unknown, unverified-phone, and exhausted-quota states have distinct non-actionable messages. Active, verified personal members and valid enterprise members retain their normal form.

`UI_API_PERMISSION_LOGIC_DIVERGENCE_AFTER=NO`
`SERVER_SIDE_PUBLISH_BLOCK_RETAINED=YES`

## 9. Privacy and agreement copy

No standalone privacy-policy or member-agreement text in the baseline claimed that a new personal member must provide an identity number or images. Registration-specific validation/help copy did require and describe those uploads, so that copy was removed and replaced with an accurate data-minimization notice.

`PRIVACY_COPY_UPDATE_REQUIRED=YES`
`PRIVACY_COPY_UPDATED=YES`

## 10. Modified files

1. `app/api/auth/me/route.ts`
2. `app/api/auth/register/route.ts`
3. `app/api/member/dashboard/route.ts`
4. `app/membership/admin/accounts/page.tsx`
5. `app/membership/content/publish/page.tsx`
6. `app/membership/register/page.tsx`
7. `components/membership/MemberPublishAccessBoundary.tsx`
8. `scripts/selftest-membership-security.ts`
9. `scripts/tsconfig.scripts.json`
10. `reports/membership-security/PERSONAL_REGISTRATION_AND_PENDING_UI_LOCAL_FIX_20260831.md`

`FINAL_CHANGESET_FILE_COUNT=10`
`UNRELATED_CHANGE_INCLUDED=NO`

No quota implementation, SMS provider, Prisma schema/migration, historical category, or unrelated feature file is included.

## 11. Automated tests

Node `v20.20.1` results:

`TEST_PERSONAL_REGISTER_WITHOUT_ID_NUMBER=PASS`
`TEST_PERSONAL_REGISTER_WITHOUT_ID_FRONT=PASS`
`TEST_PERSONAL_REGISTER_WITHOUT_ID_BACK=PASS`
`TEST_REAL_NAME_REQUIRED=PASS`
`TEST_PHONE_REQUIRED=PASS`
`TEST_SMS_REQUIRED=PASS`
`TEST_AGREEMENT_REQUIRED=PASS`
`TEST_PERSONAL_DEFAULT_PENDING_REVIEW=PASS`
`TEST_PENDING_REVIEW_PUBLISH_FORM_HIDDEN=PASS`
`TEST_PENDING_REVIEW_SUBMIT_BUTTON_HIDDEN=PASS`
`TEST_PENDING_REVIEW_STATUS_MESSAGE_VISIBLE=PASS`
`TEST_PENDING_REVIEW_API_PUBLISH_BLOCK=PASS`
`TEST_APPROVED_PERSONAL_PUBLISH_FORM_VISIBLE=PASS`
`ADMIN_REVIEW_WITHOUT_IDENTITY_DATA=PASS`

The registration assertions call the actual registration route with multipart requests containing no identity fields. The UI assertions server-render the access boundary and prove that blocked children and their submit button are absent. The administrator assertion calls the actual review PATCH handler with all identity fields null.

Additional applicable suites:

- `selftest:membership-security=PASS`
- `selftest:enterprise-basic-limits=PASS`
- `selftest:keyword-filter=PASS`
- `selftest:aliyun-sms=PASS` (provider-safety mocks only; no real send)
- `selftest:pending-brand-threshold=SKIPPED_FEATURE_DISABLED` (expected baseline behavior)

The historically referenced `scripts/selftest-security-guards.js` is not present in this exact baseline and is not a configured package script; no PASS is claimed for a nonexistent file.

## 12. Quota regression

The effective-access regression suite verifies the frozen limits and forced publishing location without changing quota code or production data.

`PERSONAL_QUOTA_REGRESSION=PASS`
`ENTERPRISE_BASIC_QUOTA_REGRESSION=PASS`
`ZHZX_QUOTA_REGRESSION=PASS` (1000/year)
`DINGZHIJIAJU_QUOTA_REGRESSION=PASS` (160/year)
`OLD_ZHJ_QUOTA_REGRESSION=PASS` (5000/year)
`LEGACY_COMPANY_QUOTA_REGRESSION=PASS` (5/year)

Ordinary `enterprise_basic` remains 5/year and personal remains 2/year.

## 13. Category and article-review regression

`CATEGORY_FORCE_REGRESSION=PASS`
`ARTICLE_REVIEW_REGRESSION=PASS`
`CREATE_PUBLISHED_BYPASS_REGRESSION=PASS`
`UPDATE_PUBLISHED_BYPASS_REGRESSION=PASS`

Personal and `enterprise_basic` submissions remain restricted to enterprise news, member-created articles remain pending review, and create/update attempts cannot force `published`.

## 14. Schema gate

The four identity fields in `prisma/schema.prisma` are nullable and the existing migration created nullable columns. No schema edit or migration is required or included.

`SCHEMA_CHANGE_REQUIRED=NO`
`PRISMA_MIGRATION_CREATED=NO`

## 15. Local UI and Node 20 gates

A Node 20 production build was started locally on an isolated port. `/membership/register` returned HTTP 200; its rendered HTML contained none of the three removed identity controls and did contain the new data-minimization notice. The local process was then terminated and the port released.

The browser runtime reported no available browser, so no screenshot or visual PASS is claimed. Pending and active personal states are instead covered by the deterministic render tests described above.

`VISUAL_REVIEW=NOT_AVAILABLE`
`LOCAL_REGISTER_HTTP_CHECK=PASS`
`NODE_VERSION=v20.20.1`
`PRISMA_GENERATE=PASS`
`TYPECHECK=PASS`
`LINT=PASS`
`TESTS=PASS`
`NEXT_BUILD=PASS`

The original `npm run lint` passed when the same nested worktree was temporarily exposed at a drive root, eliminating duplicate parent-config discovery; the temporary mapping was removed. It reported only one pre-existing warning in an unchanged enterprise administrator page. `next build` exited 0. Because this local worktree intentionally has no database configuration, static data lookups logged handled missing-configuration errors during page generation; the build still completed successfully.

## 16. Production and changeset safety

`SECRET_IN_CHANGESET=NO`
`PII_IN_CHANGESET=NO`
`ENV_STAGED=NO`
`PUSH=NO`
`DEPLOY=NO`
`PRODUCTION_WRITE=NO`
`PRODUCTION_DATABASE_WRITE=NO`
`SERVICE_RESTART=NO`

Only the read-only test-record check described in section 4 touched production context. No production file, database row, service, schema, migration state, or environment configuration was changed.

## 17. Local commit and next acceptance plan

Branch: `fix/personal-registration-pending-ui-20260831`
Commit subject: `fix(membership): simplify personal verification and gate pending review UI`
`LOCAL_COMMIT=this report is part of that commit; immutable hash is recorded in the final handoff`

No secure input window should be reopened yet. After explicit deployment authorization and a successful deployment, the next production acceptance must verify, in order: registration without identity collection; one real SMS verification; personal `pending_review`; hidden publish form and API block before approval; administrator activation without identity data; visible form after approval; forced enterprise-news submission; pending article review; two-per-year personal quota; and the previously planned historical wrong-category correction. Any test accounts/articles must then be cleaned up under a separately controlled production-write window.

`NEXT_PRODUCTION_ACCEPTANCE_READY=NO`
Reason: the fix is locally ready for review but has not been authorized, pushed, or deployed.

Final local status: `LOCAL_FIX_READY_FOR_REVIEW`
