import { applyPendingBrandPolicy, PENDING_BRAND_GENERATION_ENABLED } from "../lib/pending-brand-policy";

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`Assertion failed: ${name}`);
}

const keyword = { keyword: "WOCA", score: 10, weight: 5, source: "title" };
const result = applyPendingBrandPolicy({
  keywords: [keyword],
  pendingBrandCandidates: [{ brandName: "Unknown Example Brand", sourceContext: "selftest" }],
});

assert("pending brand generation flag remains disabled", PENDING_BRAND_GENERATION_ENABLED === false);
assert("unknown brand does not create pending brand", result.pendingBrands.length === 0);
assert("normal keyword processing remains intact", result.keywords.length === 1 && result.keywords[0] === keyword);
console.log("pending brand disabled-state selftest passed");
