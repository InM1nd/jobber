-- Iteration 3: progressive search runs + deterministic pre-score.
-- Idempotent. Run AFTER 003_guided_form_multi_cv.sql.
alter table "SearchRun" add column if not exists "doneSourceIds" text[] not null default '{}';
alter table "SearchRun" add column if not exists "firstMatchAt" timestamp(3);
alter table "SearchRun" add column if not exists "aiCalls" integer not null default 0;
alter table "JobMatch" add column if not exists "preScore" integer;
create index if not exists "Job_dedupeKey_idx" on "Job" ("dedupeKey");
