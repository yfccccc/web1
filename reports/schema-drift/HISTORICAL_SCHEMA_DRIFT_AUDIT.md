# Historical Schema Drift Audit

Status: read-only analysis. No schema repair, migration reset, `db push`, index rename, foreign-key recreation, or production operation was performed.

## Scope separation

- `MEMBERSHIP_SECURITY_DRIFT`: none identified in local validation. Migration `20260827000100_membership_security` only adds member review/identity columns, `members_accountStatus_idx`, `sms_verifications`, and its two indexes.
- `PREEXISTING_HISTORICAL_DRIFT`: yes. Local Prisma schema diff identifies historical differences involving `baidu_push_jobs`, `industry_whitelist`, `news_keywords`, `pending_brands`, `articles_source_type_idx`, an article-view unique-index name, and a Baidu job foreign-key name.

`PREEXISTING_HISTORICAL_DRIFT=YES`: the affected migration history predates the membership-security migration (for example, the keyword workflow commit is `5738030`; the view-dedup commit is `6fed020`). The security migration touches neither those tables nor their indexes/foreign keys.

## Object classification

| Object | Type | Database/Prisma evidence | Migration-history reference | Current business reference | Membership-security dependency | Risk if changed now |
| --- | --- | --- | --- | --- | --- | --- |
| `baidu_push_jobs` | table, timestamp columns, FK | Present in Prisma and reported by local diff | View-dedup/Baidu migration history | `lib/baidu-submit.ts` creates, reads and writes jobs | None | Could break Baidu submission/retry processing |
| `industry_whitelist` | table, timestamp-column mapping | Present in Prisma and reported by local diff | Keyword workflow migration | Admin APIs, seed and keyword extraction read/write it | None | Could break keyword filtering and admin management |
| `news_keywords` | table, timestamp-column mapping | Present in Prisma and reported by local diff | Keyword workflow migration | Article/admin keyword synchronization reads/writes it | None | Could break article keyword persistence |
| `pending_brands` | table, timestamp-column mapping | Present in Prisma and reported by local diff | Keyword workflow migration | Admin/scripts and pending-brand policy use it | None | Could disrupt candidate-brand workflow |
| `articles_source_type_idx` | index | Reported by local diff | Article source-type migration | Article filtering/query performance | None | Potential query-performance regression |
| Baidu job FK / article-view unique-index name | constraint/index names | Reported by local diff | Historical migrations | Baidu job relation and view deduplication | None | Referential-integrity or migration-chain risk |

## Direct overlap check

`SECURITY_MIGRATION_TOUCHED_OBJECTS=members, members_accountStatus_idx, sms_verifications, sms_verifications_phone_purpose_createdAt_idx, sms_verifications_expiresAt_idx`

`HISTORICAL_DRIFT_OBJECTS=baidu_push_jobs, industry_whitelist, news_keywords, pending_brands, articles_source_type_idx, Baidu FK name, article-view index name`

`DIRECT_OBJECT_OVERLAP=NO`

## Production-readiness implication

The historical drift does not itself demonstrate that the membership-security migration conflicts at an object level. It must nevertheless be classified before production migration approval. The correct future approaches are, in order of safety:

1. Inventory the production objects and migration history using a separately approved read-only audit.
2. Decide per object whether it is represented in Prisma, intentionally unmanaged, or needs a dedicated reconciliation baseline.
3. If reconciliation is approved, create a dedicated historical reconciliation migration with backup, review and rollback plan.

Do not repair these objects by dropping tables, using `prisma db push`, resetting migrations, renaming indexes blindly, or recreating constraints during the membership-security rollout.
