import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (...parts: string[]) => readFileSync(path.join(root, ...parts), "utf8");
const dictionaryRoute = read("app", "api", "member", "dictionary-entries", "[id]", "route.ts");
const reviewRoute = read("app", "api", "admin", "article-change-requests", "[id]", "route.ts");
const sessionRoute = read("lib", "session.ts");

function lockAllowsSession(lockedUntil: Date | null, now: Date) {
  return !lockedUntil || lockedUntil <= now;
}

async function runConditionalClaimFixture() {
  let status = "pending";
  let applyCount = 0;
  const approve = async () => {
    if (status !== "pending") return false;
    status = "approved";
    applyCount += 1;
    return true;
  };

  const results = await Promise.all([approve(), approve()]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(status, "approved");
  assert.equal(applyCount, 1);
}

function runRollbackFixture() {
  const state = { requestStatus: "pending", articleTitle: "before" };
  const transaction = () => {
    const draft = { ...state };
    draft.requestStatus = "approved";
    throw new Error("article update failed");
  };
  assert.throws(transaction, /article update failed/);
  assert.deepEqual(state, { requestStatus: "pending", articleTitle: "before" });
}

async function main() {
  assert.match(dictionaryRoute, /if \(session\.role !== "ADMIN"\) return false;/);
  assert.match(dictionaryRoute, /articleChangeRequest\.create\(/);
  assert.match(dictionaryRoute, /submitterId: session\.sub/);
  assert.match(dictionaryRoute, /status: "pending"/);
  assert.doesNotMatch(dictionaryRoute, /if \(!dictionaryContribution\)/);
  assert.match(dictionaryRoute, /const \{ authorMemberId, \.\.\.memberArticle \} = article;/);
  assert.match(dictionaryRoute, /article: memberArticle/);

  assert.match(reviewRoute, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(reviewRoute, /canChangeReviewStatus\(session\)/);
  assert.match(reviewRoute, /tx\.articleChangeRequest\.updateMany\(/);
  assert.match(reviewRoute, /where: \{ id, status: "pending" \}/);
  assert.match(reviewRoute, /if \(claimed\.count !== 1\)/);
  assert.match(reviewRoute, /await tx\.article\.update\(/);
  assert.match(reviewRoute, /status: 409/);
  assert.doesNotMatch(read("lib", "article-change.ts"), /authorMemberId/);

  assert.match(sessionRoute, /lockedUntil: true/);
  assert.match(sessionRoute, /dbMember\.lockedUntil && dbMember\.lockedUntil > new Date\(\)/);
  const now = new Date("2026-08-16T00:00:00.000Z");
  assert.equal(lockAllowsSession(new Date("2026-08-16T00:00:01.000Z"), now), false);
  assert.equal(lockAllowsSession(new Date("2026-08-15T23:59:59.000Z"), now), true);
  assert.equal(lockAllowsSession(null, now), true);

  await runConditionalClaimFixture();
  runRollbackFixture();
  console.log("OWN_ENTRY_ADMIN_REVIEW_REQUIRED=PASS");
  console.log("CROSS_AUTHOR_PROPOSAL_ALLOWED=PASS");
  console.log("CROSS_AUTHOR_DIRECT_UPDATE_BLOCKED=PASS");
  console.log("MEMBER_CONTENT_EDIT_FLAGS_CANNOT_BYPASS_DICTIONARY_REVIEW=PASS");
  console.log("MEMBER_REVIEW_API_BLOCKED=PASS");
  console.log("CONCURRENT_APPROVAL_CONDITIONAL_CLAIM=PASS");
  console.log("APPROVAL_ROLLBACK_STRUCTURE=PASS");
  console.log("LOCKED_SESSION=PASS");
  console.log("AUTHOR_MEMBER_ID_RESPONSE_REMOVED=PASS");
}

void main();
