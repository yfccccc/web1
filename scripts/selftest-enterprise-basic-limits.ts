import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ENTERPRISE_BASIC_ARTICLE_LIMIT,
  ENTERPRISE_BASIC_GALLERY_LIMIT,
  getCalendarYearRange,
  isAnnualLimitReached,
} from "../lib/enterprise-basic-limits";
import { getDefaultMemberGrantSettings, type MemberGrantSettings } from "../lib/member-grants";
import {
  buildEffectiveMemberAccessFromSources,
  canMemberUseArticleLocation,
  findEffectiveCategoryAccess,
  findEffectiveSubcategoryAccess,
} from "../lib/member-access-resolver";
import { getDefaultMembershipRules, normalizeMembershipRules } from "../lib/membership-rules";

const ACCOUNT_A_ID = "cmq0aj24d00c012ug20mbbnzo";
const ACCOUNT_B_ID = "cmn5mtkan00u1aenppofkhcu4";
const ACCOUNT_C_ID = "cmmyd75kk000cwnv1onvawe8q";
const ORDINARY_IDS = [
  "cmn5msuox0001aenp4kyedcez",
  "cmn5msuup0007aenphap3t92d",
  "cmn5msuzf000daenpdrx34hxi",
];

const defaults = getDefaultMembershipRules();

function activeGrant(limit: number) {
  const grant = getDefaultMemberGrantSettings(2026);
  grant.activeFrom = "2000-01-01";
  grant.activeUntil = "2099-12-31";
  grant.categories["/news"].annualLimit = limit;
  grant.categories["/news"].subcategories["/news/enterprise"] = { enabled: true, annualLimit: limit };
  grant.categories["/news"].subcategories["/news/trends"] = { enabled: true, annualLimit: limit };
  return grant;
}

function basicAccess(memberId: string, grant: MemberGrantSettings, usedCount: number) {
  return buildEffectiveMemberAccessFromSources(
    "enterprise_basic",
    defaults.enterprise_basic,
    grant,
    {
      categoryCounts: new Map([["/news", usedCount]]),
      subcategoryCounts: new Map([["/news::/news/enterprise", usedCount]]),
    },
    2026,
    memberId,
  );
}

function assertQuota(memberId: string, grantLimit: number, usedCount: number, expectedLimit: number) {
  const effective = basicAccess(memberId, activeGrant(grantLimit), usedCount);
  const category = findEffectiveCategoryAccess(effective, "/news");
  const subcategory = findEffectiveSubcategoryAccess(effective, "/news", "/news/enterprise");
  assert.equal(category?.annualLimit, expectedLimit);
  assert.equal(category?.usedCount, usedCount);
  assert.equal(category?.remainingCount, Math.max(0, expectedLimit - usedCount));
  assert.equal(subcategory?.annualLimit, expectedLimit);
  assert.equal(subcategory?.remainingCount, Math.max(0, expectedLimit - usedCount));
  assert.equal(canMemberUseArticleLocation(effective, "/news", "/news/enterprise"), true);
  assert.equal(canMemberUseArticleLocation(effective, "/news", "/news/trends"), false);
  for (const categoryHref of ["/brands", "/dictionary", "/standards", "/awards"]) {
    assert.equal(canMemberUseArticleLocation(effective, categoryHref, null), false);
  }
}

assert.equal(defaults.enterprise_basic.newsPublishLimit, ENTERPRISE_BASIC_ARTICLE_LIMIT);
assert.equal(defaults.enterprise_basic.galleryUploadLimit, ENTERPRISE_BASIC_GALLERY_LIMIT);
assert.deepEqual(defaults.enterprise_basic.publishCategoryHrefs, ["/news"]);

const historicalTierOverride = normalizeMembershipRules({
  enterprise_basic: {
    publishCategoryHrefs: ["/news", "/dictionary", "/standards"],
    newsPublishLimit: 99,
    galleryUploadLimit: 50,
  },
});
assert.deepEqual(historicalTierOverride.enterprise_basic.publishCategoryHrefs, ["/news"]);
assert.equal(historicalTierOverride.enterprise_basic.newsPublishLimit, ENTERPRISE_BASIC_ARTICLE_LIMIT);
assert.equal(historicalTierOverride.enterprise_basic.galleryUploadLimit, ENTERPRISE_BASIC_GALLERY_LIMIT);

assertQuota(ACCOUNT_A_ID, 1000, 101, 1000);
assertQuota(ACCOUNT_C_ID, 160, 95, 160);
assert.equal(isAnnualLimitReached(999, 1000), false);
assert.equal(isAnnualLimitReached(1000, 1000), true);
assert.equal(isAnnualLimitReached(159, 160), false);
assert.equal(isAnnualLimitReached(160, 160), true);

assertQuota(ACCOUNT_B_ID, 5000, 0, 5);
for (const ordinaryId of ORDINARY_IDS) {
  assertQuota(ordinaryId, 5000, 0, 5);
}
assert.equal(isAnnualLimitReached(4, 5), false);
assert.equal(isAnnualLimitReached(5, 5), true);

const expiredGrant = activeGrant(1000);
expiredGrant.activeFrom = "2020-01-01";
expiredGrant.activeUntil = "2020-12-31";
assert.equal(findEffectiveCategoryAccess(basicAccess(ACCOUNT_A_ID, expiredGrant, 0), "/news")?.annualLimit, 5);

const personal = buildEffectiveMemberAccessFromSources(
  "personal",
  defaults.personal,
  activeGrant(5000),
  { categoryCounts: new Map(), subcategoryCounts: new Map() },
  2026,
  ACCOUNT_A_ID,
);
assert.equal(findEffectiveCategoryAccess(personal, "/news")?.annualLimit, 2);
assert.equal(canMemberUseArticleLocation(personal, "/news", "/news/enterprise"), true);
assert.equal(canMemberUseArticleLocation(personal, "/news", "/news/trends"), false);

for (let count = 0; count < ENTERPRISE_BASIC_GALLERY_LIMIT; count += 1) {
  assert.equal(isAnnualLimitReached(count, ENTERPRISE_BASIC_GALLERY_LIMIT), false);
}
assert.equal(isAnnualLimitReached(ENTERPRISE_BASIC_GALLERY_LIMIT, ENTERPRISE_BASIC_GALLERY_LIMIT), true);

const range = getCalendarYearRange(new Date("2026-08-15T12:00:00.000Z"));
assert.equal(range.start.toISOString(), "2026-01-01T00:00:00.000Z");
assert.equal(range.end.toISOString(), "2027-01-01T00:00:00.000Z");

const createRoute = readFileSync(resolve(process.cwd(), "app/api/member/articles/route.ts"), "utf8");
const contentPage = readFileSync(resolve(process.cwd(), "app/membership/content/page.tsx"), "utf8");
assert.match(createRoute, /effectiveAnnualLimit:\s*restrictedCategoryAccess\?\.annualLimit/);
assert.match(createRoute, /defaultContentStatusForSubmission/);
assert.doesNotMatch(createRoute, /body\.status/);
assert.match(contentPage, /effectivePublishingLabels/);

console.log("STANDARD_ENTERPRISE_BASIC_LIMIT_TEST=PASS");
console.log("A_SPECIAL_QUOTA_TEST=PASS");
console.log("B_SPECIAL_QUOTA_TEST=PASS_NOT_RESTORED_WITHOUT_EVIDENCE");
console.log("C_SPECIAL_QUOTA_TEST=PASS");
console.log("ORDINARY_ENTERPRISE_BASIC_STILL_5_PER_YEAR=PASS");
console.log("CATEGORY_FORCE_REGRESSION=PASS");
