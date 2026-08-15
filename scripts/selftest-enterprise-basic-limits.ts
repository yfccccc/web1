import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ENTERPRISE_BASIC_ARTICLE_CATEGORY_HREF,
  ENTERPRISE_BASIC_ARTICLE_LIMIT,
  ENTERPRISE_BASIC_ARTICLE_SUB_HREF,
  ENTERPRISE_BASIC_GALLERY_LIMIT,
  canMemberUseArticleLocation,
  getCalendarYearRange,
  isAnnualLimitReached,
} from "../lib/enterprise-basic-limits";
import { getDefaultMemberGrantSettings } from "../lib/member-grants";
import { buildEffectiveMemberAccessFromSources } from "../lib/member-access-resolver";
import { getDefaultMembershipRules, normalizeMembershipRules } from "../lib/membership-rules";

const defaults = getDefaultMembershipRules();
assert.equal(defaults.enterprise_basic.newsPublishLimit, ENTERPRISE_BASIC_ARTICLE_LIMIT);
assert.equal(defaults.enterprise_basic.galleryUploadLimit, ENTERPRISE_BASIC_GALLERY_LIMIT);
assert.deepEqual(defaults.enterprise_basic.publishCategoryHrefs, ["/news"]);

const historicalOverride = normalizeMembershipRules({
  enterprise_basic: {
    publishCategoryHrefs: ["/news", "/dictionary", "/standards"],
    newsPublishLimit: 99,
    galleryUploadLimit: 50,
  },
});
assert.deepEqual(historicalOverride.enterprise_basic.publishCategoryHrefs, ["/news"]);
assert.equal(historicalOverride.enterprise_basic.newsPublishLimit, ENTERPRISE_BASIC_ARTICLE_LIMIT);
assert.equal(historicalOverride.enterprise_basic.galleryUploadLimit, ENTERPRISE_BASIC_GALLERY_LIMIT);

for (const subHref of ["/news/trends", "/news/tech", "/news/events"]) {
  assert.equal(canMemberUseArticleLocation("enterprise_basic", "/news", subHref), false);
}
for (const categoryHref of ["/brands", "/brands/buying", "/dictionary", "/standards", "/awards"]) {
  assert.equal(canMemberUseArticleLocation("enterprise_basic", categoryHref, null), false);
}
assert.equal(
  canMemberUseArticleLocation("enterprise_basic", ENTERPRISE_BASIC_ARTICLE_CATEGORY_HREF, ENTERPRISE_BASIC_ARTICLE_SUB_HREF),
  true
);
assert.equal(canMemberUseArticleLocation("personal", "/dictionary", "/dictionary/terms"), true);
assert.equal(canMemberUseArticleLocation("enterprise_advanced", "/awards", null), true);

const access = buildEffectiveMemberAccessFromSources(
  "enterprise_basic",
  defaults.enterprise_basic,
  getDefaultMemberGrantSettings(),
  { categoryCounts: new Map([["/news", 4]]), subcategoryCounts: new Map([["/news::/news/enterprise", 4]]) },
  2026
);
const enabledLocations = access.categories.flatMap((category) =>
  category.subcategories.filter((sub) => sub.enabled).map((sub) => `${category.href}:${sub.href}`)
);
assert.deepEqual(enabledLocations, ["/news:/news/enterprise"]);
assert.equal(access.categories.find((item) => item.href === "/news")?.remainingCount, 1);

const individualGrant = getDefaultMemberGrantSettings();
individualGrant.categories["/dictionary"].enabled = true;
individualGrant.categories["/news"].subcategories["/news/trends"].enabled = true;
const accessWithGrant = buildEffectiveMemberAccessFromSources(
  "enterprise_basic",
  defaults.enterprise_basic,
  individualGrant,
  { categoryCounts: new Map([["/news", 5]]), subcategoryCounts: new Map([["/news::/news/enterprise", 5]]) },
  2026
);
assert.equal(accessWithGrant.categories.find((item) => item.href === "/dictionary")?.enabled, false);
assert.equal(
  accessWithGrant.categories.find((item) => item.href === "/news")?.subcategories.find((item) => item.href === "/news/trends")?.enabled,
  false
);
assert.equal(accessWithGrant.categories.find((item) => item.href === "/news")?.remainingCount, 0);

for (let count = 0; count < ENTERPRISE_BASIC_ARTICLE_LIMIT; count += 1) {
  assert.equal(isAnnualLimitReached(count, ENTERPRISE_BASIC_ARTICLE_LIMIT), false);
}
assert.equal(isAnnualLimitReached(ENTERPRISE_BASIC_ARTICLE_LIMIT, ENTERPRISE_BASIC_ARTICLE_LIMIT), true);

for (let count = 0; count < ENTERPRISE_BASIC_GALLERY_LIMIT; count += 1) {
  assert.equal(isAnnualLimitReached(count, ENTERPRISE_BASIC_GALLERY_LIMIT), false);
}
assert.equal(isAnnualLimitReached(ENTERPRISE_BASIC_GALLERY_LIMIT, ENTERPRISE_BASIC_GALLERY_LIMIT), true);
assert.equal(isAnnualLimitReached(ENTERPRISE_BASIC_GALLERY_LIMIT + 1, ENTERPRISE_BASIC_GALLERY_LIMIT), true);

const articlesRoute = readFileSync(resolve(process.cwd(), "app/api/member/articles/route.ts"), "utf8");
const articlePatchRoute = readFileSync(resolve(process.cwd(), "app/api/member/articles/[id]/route.ts"), "utf8");
const articleChangesRoute = readFileSync(resolve(process.cwd(), "app/api/member/articles/[id]/changes/route.ts"), "utf8");
assert.match(articlesRoute, /normalizeRichTextField/);
assert.match(articlePatchRoute, /article\.authorMemberId !== session\.sub/);
assert.match(articleChangesRoute, /authorMemberId: true/);
assert.match(articleChangesRoute, /article\.authorMemberId !== session\.sub/);

const range = getCalendarYearRange(new Date("2026-08-15T12:00:00.000Z"));
assert.equal(range.start.toISOString(), "2026-01-01T00:00:00.000Z");
assert.equal(range.end.toISOString(), "2027-01-01T00:00:00.000Z");

console.log("enterprise-basic limits self-test passed");
