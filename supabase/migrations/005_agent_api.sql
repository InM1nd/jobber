-- Agent API: extra tracker fields on "Application". Idempotent. Run AFTER 004_speedup_prescore.sql.
alter table "Application" add column if not exists "location" text;
alter table "Application" add column if not exists "source" text;
alter table "Application" add column if not exists "priority" text;
alter table "Application" add column if not exists "score" integer;
alter table "Application" add column if not exists "whyFit" text;
alter table "Application" add column if not exists "risks" text;
alter table "Application" add column if not exists "nextAction" text;
alter table "Application" add column if not exists "dedupeKey" text;
create index if not exists "Application_userId_dedupeKey_idx" on "Application" ("userId", "dedupeKey");
-- New status value 'check_listing' needs no DDL (status is text).
