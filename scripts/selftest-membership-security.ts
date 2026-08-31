import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

let articleCount = 0;
let countCalls = 0;
let smsVerificationAvailable = true;
let createdMemberData: Record<string, unknown> | null = null;
let updatedMemberData: Record<string, unknown> | null = null;
const adminTargetMember = {
  id: "member-without-identity",
  email: "member-without-identity",
  recoveryEmail: null,
  name: "No Identity Member",
  role: "MEMBER",
  memberType: "personal",
  phone: "138" + "0".repeat(8),
  phoneVerified: true,
  accountStatus: "pending_review",
  realName: "Test Member",
  identityDocumentType: null,
  memberTypeExpiresAt: null,
  rankingWeight: 0,
  canPublishWithoutReview: false,
  canManageMembers: false,
  canDeleteOwnContent: false,
  canDeleteMemberContent: false,
  canDeleteAllContent: false,
  canEditOwnContent: false,
  canEditMemberContent: false,
  canEditAllContent: false,
  registeredAt: new Date("2026-08-31T00:00:00.000Z"),
  reviewedAt: null,
  createdAt: new Date("2026-08-31T00:00:00.000Z"),
};
const prismaPath = require.resolve("../lib/prisma");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      article: {
        count: async () => {
          countCalls += 1;
          return articleCount;
        },
      },
      member: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
          where.id === adminTargetMember.id ? adminTargetMember : null,
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdMemberData = data;
          return {
            id: "new-personal-member",
            email: String(data.email),
            role: data.role,
            memberType: data.memberType,
          };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updatedMemberData = data;
          return { ...adminTargetMember, ...data };
        },
      },
    },
  },
  children: [],
  paths: [],
} as unknown as NodeModule;

function mockModule(path: string, exports: Record<string, unknown>) {
  const filename = require.resolve(path);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
    children: [],
    paths: [],
  } as unknown as NodeModule;
}

mockModule("../lib/sms-verification", {
  consumeVerifiedRegistrationSms: async () => smsVerificationAvailable,
});
mockModule("../lib/auth", {
  signToken: async () => "membership-security-test-token",
});
mockModule("../lib/operation-log", {
  writeOperationLog: async () => undefined,
});
mockModule("../lib/rate-limit", {
  consumeRateLimit: () => ({ allowed: true, retryAfterSec: 0 }),
  createRateLimitResponse: () => new Response(null, { status: 429 }),
  getClientIp: () => "127.0.0.1",
});
mockModule("../lib/session", {
  getSession: async () => ({
    sub: "super-admin",
    email: "super-admin",
    role: "SUPER_ADMIN",
  }),
});

const publishing = require("../lib/membership-publishing") as typeof import("../lib/membership-publishing");
const {
  MemberPublishAccessBoundary,
  resolveMemberPublishAccessBlock,
} = require("../components/membership/MemberPublishAccessBoundary") as typeof import("../components/membership/MemberPublishAccessBoundary");

function buildRegistrationRequest(overrides: Record<string, string | null> = {}) {
  const values: Record<string, string | null> = {
    account: "personal-no-identity",
    password: "Safe" + "Pass" + "123!",
    name: "Personal Member",
    phone: "138" + "0".repeat(7) + "1",
    realName: "Personal Member",
    region: "Zhejiang Hangzhou",
    occupationType: "Designer",
    companyOrOrganization: "",
    applicationReason: "Membership registration",
    agreedToTerms: "true",
    agreedToPrivacy: "true",
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) form.append(key, value);
  }
  return new NextRequest("http://localhost/api/auth/register", { method: "POST", body: form });
}

async function submissionError(input: {
  memberType: string;
  memberId?: string;
  role?: string | null;
  accountStatus?: string | null;
  phoneVerified?: boolean;
  effectiveAnnualLimit?: number | null;
}) {
  return publishing.assertRestrictedMemberCanSubmit({
    memberId: input.memberId ?? "member-security-selftest",
    memberType: input.memberType,
    role: input.role ?? "MEMBER",
    accountStatus: input.accountStatus ?? "active",
    phoneVerified: input.phoneVerified ?? true,
    effectiveAnnualLimit: input.effectiveAnnualLimit,
  });
}

async function run() {
  assert.deepEqual(publishing.RESTRICTED_MEMBER_PUBLICATION.personal, {
    categoryHref: "/news",
    subHref: "/news/enterprise",
    annualLimit: 2,
  });
  assert.deepEqual(publishing.RESTRICTED_MEMBER_PUBLICATION.enterprise_basic, {
    categoryHref: "/news",
    subHref: "/news/enterprise",
    annualLimit: 5,
  });

  countCalls = 0;
  assert.ok(await submissionError({ memberType: "personal", accountStatus: "pending_review" }));
  assert.ok(await submissionError({ memberType: "personal", accountStatus: "active", phoneVerified: false }));
  assert.equal(countCalls, 0);

  for (articleCount = 0; articleCount < 2; articleCount += 1) {
    assert.equal(await submissionError({ memberType: "personal" }), null);
  }
  articleCount = 2;
  assert.ok(await submissionError({ memberType: "personal" }));

  for (articleCount = 0; articleCount < 5; articleCount += 1) {
    assert.equal(await submissionError({ memberType: "enterprise_basic" }), null);
  }
  articleCount = 5;
  assert.ok(await submissionError({ memberType: "enterprise_basic" }));

  articleCount = 999;
  assert.equal(
    await submissionError({
      memberId: "cmq0aj24d00c012ug20mbbnzo",
      memberType: "enterprise_basic",
      effectiveAnnualLimit: 1000,
    }),
    null,
  );
  articleCount = 1000;
  assert.ok(
    await submissionError({
      memberId: "cmq0aj24d00c012ug20mbbnzo",
      memberType: "enterprise_basic",
      effectiveAnnualLimit: 1000,
    }),
  );

  articleCount = 159;
  assert.equal(
    await submissionError({
      memberId: "cmmyd75kk000cwnv1onvawe8q",
      memberType: "enterprise_basic",
      effectiveAnnualLimit: 160,
    }),
    null,
  );
  articleCount = 160;
  assert.ok(
    await submissionError({
      memberId: "cmmyd75kk000cwnv1onvawe8q",
      memberType: "enterprise_basic",
      effectiveAnnualLimit: 160,
    }),
  );

  articleCount = 4999;
  assert.equal(
    await submissionError({
      memberId: "cmmyd6f0m000awnv11ni35xja",
      memberType: "enterprise_basic",
      effectiveAnnualLimit: 5000,
    }),
    null,
  );
  articleCount = 5000;
  assert.ok(
    await submissionError({
      memberId: "cmmyd6f0m000awnv11ni35xja",
      memberType: "enterprise_basic",
      effectiveAnnualLimit: 5000,
    }),
  );

  articleCount = 5;
  assert.ok(
    await submissionError({
      memberId: "cmn5mtkan00u1aenppofkhcu4",
      memberType: "enterprise_basic",
      effectiveAnnualLimit: 5000,
    }),
  );

  articleCount = 999;
  assert.equal(await submissionError({ memberType: "personal", role: "ADMIN" }), null);

  const pendingBlock = resolveMemberPublishAccessBlock({
    memberType: "personal",
    accountStatus: "pending_review",
    phoneVerified: true,
    categoryRemainingCount: 2,
    subcategoryRemainingCount: 2,
  });
  const pendingMarkup = renderToStaticMarkup(
    createElement(
      MemberPublishAccessBoundary,
      { block: pendingBlock },
      createElement(
        "form",
        { "data-testid": "publish-form" },
        createElement("input", { name: "title" }),
        createElement("button", { type: "submit" }, "提交审核"),
      ),
    ),
  );
  assert.doesNotMatch(pendingMarkup, /data-testid="publish-form"/);
  assert.doesNotMatch(pendingMarkup, /<button[^>]+type="submit"/);
  assert.match(pendingMarkup, /账号资料正在审核中，审核通过后即可投稿。/);

  const approvedBlock = resolveMemberPublishAccessBlock({
    memberType: "personal",
    accountStatus: "active",
    phoneVerified: true,
    categoryRemainingCount: 2,
    subcategoryRemainingCount: 2,
  });
  const approvedMarkup = renderToStaticMarkup(
    createElement(
      MemberPublishAccessBoundary,
      { block: approvedBlock },
      createElement("form", { "data-testid": "publish-form" }, createElement("button", { type: "submit" }, "提交审核")),
    ),
  );
  assert.match(approvedMarkup, /data-testid="publish-form"/);
  assert.match(approvedMarkup, /<button type="submit">提交审核<\/button>/);
  assert.equal(
    resolveMemberPublishAccessBlock({ memberType: "personal", accountStatus: "rejected", phoneVerified: true })?.code,
    "rejected",
  );
  assert.equal(
    resolveMemberPublishAccessBlock({ memberType: "personal", accountStatus: "suspended", phoneVerified: true })?.code,
    "suspended",
  );
  assert.equal(
    resolveMemberPublishAccessBlock({
      memberType: "enterprise_basic",
      accountStatus: "active",
      phoneVerified: false,
      categoryRemainingCount: 5,
      subcategoryRemainingCount: 5,
    }),
    null,
  );
  assert.equal(
    resolveMemberPublishAccessBlock({
      memberType: "personal",
      accountStatus: "active",
      phoneVerified: true,
      categoryRemainingCount: 0,
      subcategoryRemainingCount: 0,
    })?.code,
    "quota_exhausted",
  );

  const registerHandler = require("../app/api/auth/register/route") as typeof import("../app/api/auth/register/route");
  smsVerificationAvailable = true;
  createdMemberData = null;
  const registrationResponse = await registerHandler.POST(buildRegistrationRequest());
  assert.equal(registrationResponse.status, 200);
  const registrationBody = await registrationResponse.json();
  assert.equal(registrationBody.memberType, "personal");
  assert.equal(registrationBody.accountStatus, "pending_review");
  assert.ok(createdMemberData);
  assert.equal(createdMemberData?.phoneVerified, true);
  assert.equal(createdMemberData?.accountStatus, "pending_review");
  assert.equal(createdMemberData?.realName, "Personal Member");
  for (const key of ["identityDocumentType", "identityDocumentNumber", "identityDocumentFrontPath", "identityDocumentBackPath"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(createdMemberData, key), false);
  }

  const missingRealNameResponse = await registerHandler.POST(buildRegistrationRequest({ account: "missing-real-name", realName: null }));
  assert.equal(missingRealNameResponse.status, 400);
  const missingPhoneResponse = await registerHandler.POST(buildRegistrationRequest({ account: "missing-phone", phone: null }));
  assert.equal(missingPhoneResponse.status, 400);
  const missingAgreementResponse = await registerHandler.POST(buildRegistrationRequest({ account: "missing-agreement", agreedToPrivacy: "false" }));
  assert.equal(missingAgreementResponse.status, 400);
  smsVerificationAvailable = false;
  const missingSmsResponse = await registerHandler.POST(buildRegistrationRequest({ account: "missing-sms" }));
  assert.equal(missingSmsResponse.status, 403);
  smsVerificationAvailable = true;

  const adminMemberHandler = require("../app/api/admin/members/[id]/route") as typeof import("../app/api/admin/members/[id]/route");
  updatedMemberData = null;
  const adminApprovalResponse = await adminMemberHandler.PATCH(
    new NextRequest("http://localhost/api/admin/members/member-without-identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountStatus: "active" }),
    }),
    { params: Promise.resolve({ id: adminTargetMember.id }) },
  );
  assert.equal(adminApprovalResponse.status, 200);
  const adminApprovalBody = await adminApprovalResponse.json();
  assert.equal(adminApprovalBody.accountStatus, "active");
  assert.equal(adminApprovalBody.memberType, "personal");
  assert.equal(updatedMemberData?.accountStatus, "active");

  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const registerRouteSource = read("app/api/auth/register/route.ts");
  const registerPage = read("app/membership/register/page.tsx");
  const createRoute = read("app/api/member/articles/route.ts");
  const updateRoute = read("app/api/member/articles/[id]/route.ts");
  const adminMemberRoute = read("app/api/admin/members/[id]/route.ts");
  const adminMembersRoute = read("app/api/admin/members/route.ts");
  const adminAccountsPage = read("app/membership/admin/accounts/page.tsx");
  const identityStorage = read("lib/identity-documents.ts");
  const identityRoute = read("app/api/admin/members/[id]/identity-documents/[side]/route.ts");
  const publishPage = read("app/membership/content/publish/page.tsx");
  const meRoute = read("app/api/auth/me/route.ts");
  const dashboardRoute = read("app/api/member/dashboard/route.ts");
  const prismaSchema = read("prisma/schema.prisma");

  assert.match(registerRouteSource, /phoneVerified:\s*true/);
  assert.match(registerRouteSource, /accountStatus:\s*"pending_review"/);
  assert.match(registerRouteSource, /consumeVerifiedRegistrationSms/);
  assert.doesNotMatch(registerRouteSource, /identityDocument(?:Type|Number|Front|Back)|storeIdentityDocument|validateIdentityDocument/);
  assert.doesNotMatch(registerPage, /identityDocument|type="file"|身份证正面|身份证反面/);
  assert.match(registerPage, /真实姓名/);
  assert.match(registerPage, /agreedToTerms/);
  assert.match(registerPage, /agreedToPrivacy/);
  assert.match(createRoute, /assertRestrictedMemberCanSubmit/);
  assert.match(createRoute, /restrictedRule\s*\?\s*restrictedRule\.categoryHref/);
  assert.match(createRoute, /restrictedRule\s*\?\s*restrictedRule\.subHref/);
  const createPostSection = createRoute.slice(createRoute.indexOf("export async function POST"));
  const createPostBodyFields = createPostSection.match(
    /const body = await request\.json\(\)\.catch\(\(\) => \(\{\}\)\);\s*const \{([\s\S]*?)\}\s*=\s*body;/,
  )?.[1];
  assert.ok(createPostBodyFields, "POST body destructuring must remain auditable");
  assert.doesNotMatch(createPostBodyFields, /\bstatus\b/);
  assert.match(updateRoute, /data\.categoryHref\s*=\s*restrictedRule\.categoryHref/);
  assert.match(updateRoute, /data\.subHref\s*=\s*restrictedRule\.subHref/);
  assert.doesNotMatch(updateRoute, /body\.status/);
  assert.match(adminMemberRoute, /accountStatus/);
  assert.match(adminMemberRoute, /reviewedById\s*=\s*session\.sub/);
  assert.match(adminMembersRoute, /phoneVerified:\s*true/);
  assert.match(adminMembersRoute, /_count:\s*\{\s*select:\s*\{\s*articles:\s*true/);
  assert.match(adminAccountsPage, /审核通过/);
  assert.match(adminAccountsPage, /手机号/);
  assert.match(adminAccountsPage, /实名信息/);
  assert.match(adminAccountsPage, /新注册个人会员不采集身份证件资料/);
  assert.match(identityStorage, /storage["'],\s*["']identity-documents/);
  assert.doesNotMatch(identityStorage, /public["'],\s*["']identity-documents/);
  assert.match(identityRoute, /session\.role\s*!==\s*["']SUPER_ADMIN["']/);
  assert.match(identityRoute, /session\.role\s*!==\s*["']ADMIN["']/);
  assert.match(identityRoute, /status:\s*403/);
  assert.match(createRoute, /defaultContentStatusForSubmission/);
  assert.match(createRoute, /status:\s*submissionStatus/);
  assert.match(publishPage, /MemberPublishAccessBoundary/);
  assert.match(publishPage, /resolveMemberPublishAccessBlock/);
  assert.match(meRoute, /accountStatus:\s*session\.accountStatus/);
  assert.match(meRoute, /phoneVerified:\s*session\.phoneVerified/);
  assert.match(dashboardRoute, /accountStatus:\s*session\.accountStatus/);
  for (const field of ["identityDocumentType", "identityDocumentNumber", "identityDocumentFrontPath", "identityDocumentBackPath"]) {
    assert.match(prismaSchema, new RegExp(`${field}\\s+String\\?`));
  }

  console.log("TEST_PERSONAL_REGISTER_WITHOUT_ID_NUMBER=PASS");
  console.log("TEST_PERSONAL_REGISTER_WITHOUT_ID_FRONT=PASS");
  console.log("TEST_PERSONAL_REGISTER_WITHOUT_ID_BACK=PASS");
  console.log("TEST_REAL_NAME_REQUIRED=PASS");
  console.log("TEST_PHONE_REQUIRED=PASS");
  console.log("TEST_SMS_REQUIRED=PASS");
  console.log("TEST_AGREEMENT_REQUIRED=PASS");
  console.log("TEST_PERSONAL_DEFAULT_PENDING_REVIEW=PASS");
  console.log("TEST_PENDING_REVIEW_PUBLISH_FORM_HIDDEN=PASS");
  console.log("TEST_PENDING_REVIEW_SUBMIT_BUTTON_HIDDEN=PASS");
  console.log("TEST_PENDING_REVIEW_STATUS_MESSAGE_VISIBLE=PASS");
  console.log("TEST_PENDING_REVIEW_API_PUBLISH_BLOCK=PASS");
  console.log("TEST_APPROVED_PERSONAL_PUBLISH_FORM_VISIBLE=PASS");
  console.log("ADMIN_REVIEW_WITHOUT_IDENTITY_DATA=PASS");
  console.log("PERSONAL_QUOTA_REGRESSION=PASS");
  console.log("ENTERPRISE_BASIC_QUOTA_REGRESSION=PASS");
  console.log("CATEGORY_FORCE_REGRESSION=PASS");
  console.log("ARTICLE_REVIEW_REGRESSION=PASS");
  console.log("CREATE_PUBLISHED_BYPASS_REGRESSION=PASS");
  console.log("UPDATE_PUBLISHED_BYPASS_REGRESSION=PASS");
  console.log("IDENTITY_PRIVATE_STORAGE_TEST=PASS_LEGACY_COMPATIBILITY");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
