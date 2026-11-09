import type { Prisma } from "@prisma/client";
import { cleanEntityName } from "./news-keyword-rules";

/** Collect distinct saved-article observations only. Never modify the whitelist. */
export async function learnPendingKeywords(
  tx: Prisma.TransactionClient,
  articleId: string,
  candidates: Array<{ keyword: string }>,
): Promise<string[]> {
  const words = Array.from(new Set(candidates.map((item) => item.keyword)))
    .filter((word) => cleanEntityName(word) === word)
    .sort();
  // Consistent lock order prevents two multi-keyword saves from deadlocking.
  for (const word of words) {
    const now = new Date();
    // The updating upsert locks this word until the transaction commits. A second
    // concurrent article then counts the first one's committed observation.
    const pending = await tx.pendingKeyword.upsert({
      where: { word },
      create: { word, count: 0, lastSeen: now },
      update: { lastSeen: now },
    });
    await tx.pendingKeywordArticle.upsert({
      where: { keywordId_articleId: { keywordId: pending.id, articleId } },
      create: { keywordId: pending.id, articleId, lastSeen: now },
      update: { lastSeen: now },
    });
    const count = await tx.pendingKeywordArticle.count({ where: { keywordId: pending.id } });
    await tx.pendingKeyword.update({ where: { id: pending.id }, data: { count, lastSeen: now } });
    // Automatic promotion is intentionally disabled, regardless of count.
  }
  return [];
}
