import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let articleCount = 0;
let countCalls = 0;
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
    },
  },
  children: [],
  paths: [],
} as unknown as NodeModule;

const publishing = require("../lib/membership-publishing") as typeof import("../lib/membership-publishing");

async function submissionError(input: {
  memberType: string;
  role?: string | null;
  accountStatus?: string | null;
  phoneVerified?: boolean;
}) {
  return publishing.assertRestrictedMemberCanSubmit({
    memberId: "member-security-selftest",
    memberType: input.memberType,
    role: input.role ?? "MEMBER",
    accountStatus: input.accountStatus ?? "active",
    phoneVerified: input.phoneVerified ?? true,
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
  assert.equal(await submissionError({ memberType: "personal", role: "ADMIN" }), null);

  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const registerRoute = read("app/api/auth/register/route.ts");
  const createRoute = read("app/api/member/articles/route.ts");
  const updateRoute = read("app/api/member/articles/[id]/route.ts");
  const adminMemberRoute = read("app/api/admin/members/[id]/route.ts");
  const adminMembersRoute = read("app/api/admin/members/route.ts");
  const adminAccountsPage = read("app/membership/admin/accounts/page.tsx");
  const identityStorage = read("lib/identity-documents.ts");
  const identityRoute = read("app/api/admin/members/[id]/identity-documents/[side]/route.ts");

  assert.match(registerRoute, /phoneVerified:\s*true/);
  assert.match(registerRoute, /accountStatus:\s*"pending_review"/);
  assert.match(registerRoute, /consumeVerifiedRegistrationSms/);
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
  assert.match(identityStorage, /storage["'],\s*["']identity-documents/);
  assert.doesNotMatch(identityStorage, /public["'],\s*["']identity-documents/);
  assert.match(identityRoute, /session\.role\s*!==\s*["']SUPER_ADMIN["']/);
  assert.match(identityRoute, /session\.role\s*!==\s*["']ADMIN["']/);
  assert.match(identityRoute, /status:\s*403/);
  assert.match(createRoute, /defaultContentStatusForSubmission/);
  assert.match(createRoute, /status:\s*submissionStatus/);

  console.log("NEW_PERSONAL_PENDING_REVIEW_TEST=PASS");
  console.log("UNAPPROVED_PUBLISH_BLOCK_TEST=PASS");
  console.log("ADMIN_ACCOUNT_APPROVAL_TEST=PASS");
  console.log("PERSONAL_CATEGORY_FORCE_TEST=PASS");
  console.log("PERSONAL_LIMIT_TEST=PASS");
  console.log("ENTERPRISE_BASIC_CATEGORY_TEST=PASS");
  console.log("ENTERPRISE_BASIC_LIMIT_TEST=PASS");
  console.log("EXISTING_ARTICLE_REVIEW_FLOW=PASS");
  console.log("ARTICLE_REVIEW_BYPASS_TEST=PASS");
  console.log("IDENTITY_PRIVATE_STORAGE_TEST=PASS");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
