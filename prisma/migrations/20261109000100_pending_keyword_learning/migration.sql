CREATE TABLE "pending_keywords" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pending_keywords_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_keywords_word_key" ON "pending_keywords"("word");
CREATE INDEX "pending_keywords_count_idx" ON "pending_keywords"("count");

CREATE TABLE "pending_keyword_articles" (
    "keyword_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pending_keyword_articles_pkey" PRIMARY KEY ("keyword_id", "article_id")
);

CREATE INDEX "pending_keyword_articles_article_id_idx" ON "pending_keyword_articles"("article_id");
ALTER TABLE "pending_keyword_articles" ADD CONSTRAINT "pending_keyword_articles_keyword_id_fkey"
    FOREIGN KEY ("keyword_id") REFERENCES "pending_keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pending_keyword_articles" ADD CONSTRAINT "pending_keyword_articles_article_id_fkey"
    FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
