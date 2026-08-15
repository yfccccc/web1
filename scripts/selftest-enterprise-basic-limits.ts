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
  type EffectiveMemberAccess,
} from "../lib/member-access-resolver";
import { getDefaultMembershipRules, normalizeMembershipRules } from "../lib/membership-rules";

const defaults = getDefaultMembershipRules();
const noUsage = { categoryCounts: new Map<string, number>(), subcategoryCounts: new Map<string, number>() };

function activeGrant() {
  const grant = getDefaultMemberGrantSettings(2026);
  grant.activeFrom = "2000-01-01";
  grant.activeUntil = "2099-12-31";
  return grant;
}

function basicAccess(grant: MemberGrantSettings = activeGrant(), usage = noUsage) {
  return buildEffectiveMemberAccessFromSources("enterprise_basic", defaults.enterprise_basic, grant, usage, 2026);
}

function canCreateAt(access: EffectiveMemberAccess, categoryHref: string, subHref: string | null) {
  if (!canMemberUseArticleLocation(access, categoryHref, subHref)) return false;
  const category = findEffectiveCategoryAccess(access, categoryHref);
  if (!category || isAnnualLimitReached(category.usedCount, category.annualLimit)) return false;
  if (!subHref) return true;
  const subcategory = findEffectiveSubcategoryAccess(access, categoryHref, subHref);
  return Boolean(subcategory && !isAnnualLimitReached(subcategory.usedCount, subcategory.annualLimit));
}

function newsSub(access: EffectiveMemberAccess, subHref: string) {
  const sub = findEffectiveSubcategoryAccess(access, "/news", subHref);
  assert.ok(sub, `missing news subcategory ${subHref}`);
  return sub;
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

// No active override: only enterprise news, five per natural year.
const noGrantAccess = basicAccess(
  getDefaultMemberGrantSettings(2026),
  {
    categoryCounts: new Map([["/news", 4]]),
    subcategoryCounts: new Map([["/news::/news/enterprise", 4]]),
  }
);
assert.equal(canMemberUseArticleLocation(noGrantAccess, "/news", "/news/enterprise"), true);
for (const subHref of ["/news/trends", "/news/tech", "/news/events"]) {
  assert.equal(canMemberUseArticleLocation(noGrantAccess, "/news", subHref), false);
}
for (const categoryHref of ["/brands", "/brands/buying", "/dictionary", "/standards", "/awards"]) {
  assert.equal(canMemberUseArticleLocation(noGrantAccess, categoryHref, null), false);
}
assert.equal(findEffectiveCategoryAccess(noGrantAccess, "/news")?.annualLimit, 5);
assert.equal(findEffectiveCategoryAccess(noGrantAccess, "/news")?.remainingCount, 1);
for (let count = 0; count < ENTERPRISE_BASIC_ARTICLE_LIMIT; count += 1) {
  assert.equal(isAnnualLimitReached(count, ENTERPRISE_BASIC_ARTICLE_LIMIT), false);
}
assert.equal(isAnnualLimitReached(ENTERPRISE_BASIC_ARTICLE_LIMIT, ENTERPRISE_BASIC_ARTICLE_LIMIT), true);

// Active numeric overrides continue to replace the default five.
for (const annualLimit of [100, 500, 5000]) {
  const grant = activeGrant();
  grant.categories["/news"].annualLimit = annualLimit;
  grant.categories["/news"].subcategories["/news/enterprise"].annualLimit = annualLimit;
  const access = basicAccess(grant);
  assert.equal(findEffectiveCategoryAccess(access, "/news")?.annualLimit, annualLimit);
  assert.equal(newsSub(access, "/news/enterprise").annualLimit, annualLimit);
  assert.equal(canCreateAt(access, "/news", "/news/enterprise"), true);
}

// Explicit true adds only the named taxonomy locations.
const explicitLocationsGrant = activeGrant();
explicitLocationsGrant.categories["/news"].annualLimit = 300;
for (const subHref of ["/news/trends", "/news/enterprise", "/news/tech"]) {
  explicitLocationsGrant.categories["/news"].subcategories[subHref].enabled = true;
  explicitLocationsGrant.categories["/news"].subcategories[subHref].annualLimit = 100;
}
const explicitLocationsAccess = basicAccess(explicitLocationsGrant);
for (const subHref of ["/news/trends", "/news/enterprise", "/news/tech"]) {
  assert.equal(canCreateAt(explicitLocationsAccess, "/news", subHref), true);
}
assert.equal(canMemberUseArticleLocation(explicitLocationsAccess, "/news", "/news/events"), false);
assert.equal(canMemberUseArticleLocation(explicitLocationsAccess, "/not-in-taxonomy", null), false);

const explicitTaxonomyGrant = activeGrant();
explicitTaxonomyGrant.categories["/brands"].enabled = true;
explicitTaxonomyGrant.categories["/dictionary"].subcategories["/dictionary/terms"].enabled = true;
const explicitTaxonomyAccess = basicAccess(explicitTaxonomyGrant);
assert.equal(canMemberUseArticleLocation(explicitTaxonomyAccess, "/brands", null), true);
assert.equal(canMemberUseArticleLocation(explicitTaxonomyAccess, "/dictionary", "/dictionary/terms"), true);
assert.equal(canMemberUseArticleLocation(explicitTaxonomyAccess, "/dictionary", "/dictionary/concepts"), false);
assert.equal(canMemberUseArticleLocation(explicitTaxonomyAccess, "/admin", null), false);

// Explicit false is different from null and can close the default location.
const disabledDefaultGrant = activeGrant();
disabledDefaultGrant.categories["/news"].subcategories["/news/enterprise"].enabled = false;
assert.equal(canMemberUseArticleLocation(basicAccess(disabledDefaultGrant), "/news", "/news/enterprise"), false);
const disabledCategoryGrant = activeGrant();
disabledCategoryGrant.categories["/news"].enabled = false;
assert.equal(canMemberUseArticleLocation(basicAccess(disabledCategoryGrant), "/news", "/news/enterprise"), false);

// Zero quota wins even when the location is enabled.
const zeroLimitGrant = activeGrant();
zeroLimitGrant.categories["/news"].subcategories["/news/trends"].enabled = true;
zeroLimitGrant.categories["/news"].subcategories["/news/trends"].annualLimit = 0;
const zeroLimitAccess = basicAccess(zeroLimitGrant);
assert.equal(canMemberUseArticleLocation(zeroLimitAccess, "/news", "/news/trends"), true);
assert.equal(canCreateAt(zeroLimitAccess, "/news", "/news/trends"), false);

// Expired and future grants fall back to the default five and enterprise only.
for (const [activeFrom, activeUntil, grantedSub] of [
  ["2020-01-01", "2020-12-31", "/news/trends"],
  ["2098-01-01", "2098-12-31", "/news/events"],
] as const) {
  const grant = getDefaultMemberGrantSettings(2026);
  grant.activeFrom = activeFrom;
  grant.activeUntil = activeUntil;
  grant.categories["/news"].annualLimit = 100;
  grant.categories["/news"].subcategories[grantedSub].enabled = true;
  grant.categories["/news"].subcategories[grantedSub].annualLimit = 100;
  const access = basicAccess(grant);
  assert.equal(canMemberUseArticleLocation(access, "/news", grantedSub), false);
  assert.equal(canMemberUseArticleLocation(access, "/news", "/news/enterprise"), true);
  assert.equal(findEffectiveCategoryAccess(access, "/news")?.annualLimit, 5);
}

// Production grant fixture: One-clear-one-care.
const oneClearOneCare = activeGrant();
oneClearOneCare.categories["/news"].enabled = true;
oneClearOneCare.categories["/news"].annualLimit = 300;
for (const subHref of ["/news/trends", "/news/enterprise", "/news/tech"]) {
  oneClearOneCare.categories["/news"].subcategories[subHref].enabled = true;
  oneClearOneCare.categories["/news"].subcategories[subHref].annualLimit = 100;
}
const oneClearOneCareAccess = basicAccess(oneClearOneCare);
assert.equal(findEffectiveCategoryAccess(oneClearOneCareAccess, "/news")?.annualLimit, 300);
for (const subHref of ["/news/trends", "/news/enterprise", "/news/tech"]) {
  assert.equal(newsSub(oneClearOneCareAccess, subHref).annualLimit, 100);
  assert.equal(canCreateAt(oneClearOneCareAccess, "/news", subHref), true);
}
assert.equal(canMemberUseArticleLocation(oneClearOneCareAccess, "/news", "/news/events"), false);

// Production grant fixture: Jesse/Zhe.
const jesseZhe = activeGrant();
jesseZhe.categories["/news"].enabled = true;
jesseZhe.categories["/news"].annualLimit = 500;
jesseZhe.categories["/news"].subcategories["/news/enterprise"] = { enabled: true, annualLimit: 450 };
jesseZhe.categories["/news"].subcategories["/news/events"] = { enabled: true, annualLimit: 50 };
jesseZhe.categories["/news"].subcategories["/news/trends"] = { enabled: false, annualLimit: 0 };
jesseZhe.categories["/news"].subcategories["/news/tech"] = { enabled: false, annualLimit: 0 };
const jesseZheAccess = basicAccess(jesseZhe);
assert.equal(findEffectiveCategoryAccess(jesseZheAccess, "/news")?.annualLimit, 500);
assert.equal(newsSub(jesseZheAccess, "/news/enterprise").annualLimit, 450);
assert.equal(newsSub(jesseZheAccess, "/news/events").annualLimit, 50);
assert.equal(canCreateAt(jesseZheAccess, "/news", "/news/enterprise"), true);
assert.equal(canCreateAt(jesseZheAccess, "/news", "/news/events"), true);
assert.equal(canMemberUseArticleLocation(jesseZheAccess, "/news", "/news/trends"), false);
assert.equal(canMemberUseArticleLocation(jesseZheAccess, "/news", "/news/tech"), false);

// The other five known production grant shapes retain their intended access.
const wisdomHome = activeGrant();
wisdomHome.categories["/news"].annualLimit = 5000;
wisdomHome.categories["/news"].subcategories["/news/enterprise"].annualLimit = 5000;
for (const subHref of ["/news/trends", "/news/tech", "/news/events"]) {
  wisdomHome.categories["/news"].subcategories[subHref].enabled = false;
}
const wisdomHomeAccess = basicAccess(wisdomHome);
assert.equal(newsSub(wisdomHomeAccess, "/news/enterprise").annualLimit, 5000);
assert.equal(canMemberUseArticleLocation(wisdomHomeAccess, "/news", "/news/trends"), false);

const zhejiangWenzhou = activeGrant();
zhejiangWenzhou.features.standardFeedback = false;
zhejiangWenzhou.features.dictionaryContribution = false;
zhejiangWenzhou.features.standardCoBuild = false;
zhejiangWenzhou.categories["/news"].annualLimit = 160;
zhejiangWenzhou.categories["/news"].subcategories["/news/enterprise"] = { enabled: true, annualLimit: 160 };
const zhejiangWenzhouAccess = basicAccess(zhejiangWenzhou);
assert.equal(newsSub(zhejiangWenzhouAccess, "/news/enterprise").annualLimit, 160);
assert.equal(zhejiangWenzhouAccess.features.standardFeedback, false);
assert.equal(zhejiangWenzhouAccess.features.dictionaryContribution, false);
assert.equal(zhejiangWenzhouAccess.features.standardCoBuild, false);

const luckyPavilion = activeGrant();
luckyPavilion.categories["/news"].annualLimit = 5;
luckyPavilion.categories["/awards"].enabled = false;
const luckyPavilionAccess = basicAccess(luckyPavilion);
assert.equal(findEffectiveCategoryAccess(luckyPavilionAccess, "/news")?.annualLimit, 5);
assert.equal(canMemberUseArticleLocation(luckyPavilionAccess, "/awards", "/huadianbang"), false);

const muyida = activeGrant();
for (const subHref of ["/news/trends", "/news/tech", "/news/events"]) {
  muyida.categories["/news"].subcategories[subHref] = { enabled: false, annualLimit: 0 };
}
const muyidaAccess = basicAccess(muyida);
assert.equal(canMemberUseArticleLocation(muyidaAccess, "/news", "/news/enterprise"), true);
assert.equal(canMemberUseArticleLocation(muyidaAccess, "/news", "/news/events"), false);

const difan = activeGrant();
difan.categories["/news"].annualLimit = 1000;
difan.categories["/news"].subcategories["/news/enterprise"] = { enabled: true, annualLimit: 1000 };
difan.categories["/standards"].enabled = true;
difan.categories["/standards"].annualLimit = 0;
for (const subHref of Object.keys(difan.categories["/standards"].subcategories)) {
  difan.categories["/standards"].subcategories[subHref] = { enabled: false, annualLimit: 0 };
}
const difanAccess = basicAccess(difan);
assert.equal(newsSub(difanAccess, "/news/enterprise").annualLimit, 1000);
assert.equal(canMemberUseArticleLocation(difanAccess, "/standards", "/standards/material"), false);

// Personal and enterprise advanced defaults stay unchanged.
const personalAccess = buildEffectiveMemberAccessFromSources("personal", defaults.personal, activeGrant(), noUsage, 2026);
assert.equal(canMemberUseArticleLocation(personalAccess, "/dictionary", "/dictionary/terms"), true);
const advancedAccess = buildEffectiveMemberAccessFromSources(
  "enterprise_advanced",
  defaults.enterprise_advanced,
  activeGrant(),
  noUsage,
  2026
);
assert.equal(canMemberUseArticleLocation(advancedAccess, "/news", "/news/trends"), true);
assert.equal(canMemberUseArticleLocation(advancedAccess, "/awards", "/huadianbang"), true);

// Static guards: shared effective access, taxonomy, ownership, rich text and account-specific UI.
const articlesRoute = readFileSync(resolve(process.cwd(), "app/api/member/articles/route.ts"), "utf8");
const articlePatchRoute = readFileSync(resolve(process.cwd(), "app/api/member/articles/[id]/route.ts"), "utf8");
const articleChangesRoute = readFileSync(resolve(process.cwd(), "app/api/member/articles/[id]/changes/route.ts"), "utf8");
const publishPage = readFileSync(resolve(process.cwd(), "app/membership/content/publish/page.tsx"), "utf8");
const contentPage = readFileSync(resolve(process.cwd(), "app/membership/content/page.tsx"), "utf8");
const publicMembershipPage = readFileSync(resolve(process.cwd(), "app/membership/page.tsx"), "utf8");
const newsPage = readFileSync(resolve(process.cwd(), "app/membership/content/news/page.tsx"), "utf8");
assert.match(articlesRoute, /canMemberUseArticleLocation\(memberAccess, categoryHrefTrim, normalizedSubHref\)/);
assert.match(articlesRoute, /MEMBER_ALLOWED_CATEGORY_HREFS\.has/);
assert.match(articlesRoute, /normalizeRichTextField/);
assert.match(articlePatchRoute, /article\.authorMemberId !== session\.sub/);
assert.match(articlePatchRoute, /!session\.canEditOwnContent/);
assert.match(articlePatchRoute, /getEffectiveMemberAccessForMember/);
assert.match(articlePatchRoute, /canMemberUseArticleLocation\(memberAccess/);
assert.match(articleChangesRoute, /authorMemberId: true/);
assert.match(articleChangesRoute, /article\.authorMemberId !== session\.sub/);
assert.match(articleChangesRoute, /getEffectiveMemberAccessForMember/);
assert.match(articleChangesRoute, /canMemberUseArticleLocation\(memberAccess/);
assert.doesNotMatch(publishPage, /filter\(\(category\) => category\.href === "\/news"\)/);
assert.match(publishPage, /enterpriseBasicPublishSummary/);
assert.match(contentPage, /effectivePublishingLabels/);
assert.match(publicMembershipPage, /仅可发布企业动态，默认 5 篇\/年；图库上传默认 5 张\/年/);
assert.match(newsPage, /syncToMainSite: subHref === "\/news\/enterprise"/);

for (let count = 0; count < ENTERPRISE_BASIC_GALLERY_LIMIT; count += 1) {
  assert.equal(isAnnualLimitReached(count, ENTERPRISE_BASIC_GALLERY_LIMIT), false);
}
assert.equal(isAnnualLimitReached(ENTERPRISE_BASIC_GALLERY_LIMIT, ENTERPRISE_BASIC_GALLERY_LIMIT), true);
assert.equal(isAnnualLimitReached(ENTERPRISE_BASIC_GALLERY_LIMIT + 1, ENTERPRISE_BASIC_GALLERY_LIMIT), true);

const range = getCalendarYearRange(new Date("2026-08-15T12:00:00.000Z"));
assert.equal(range.start.toISOString(), "2026-01-01T00:00:00.000Z");
assert.equal(range.end.toISOString(), "2027-01-01T00:00:00.000Z");

console.log("enterprise-basic admin override self-test passed");
