-- 006: ideas taken from AienTech/dossier. Idempotent: safe to run more than once. Run AFTER 005_agent_api.sql.

-- "Facts about me": true things that aren't in the CV, one per line (start date, permit, salary, links).
alter table "Profile" add column if not exists "facts" text;

-- AI output metadata on a match: prompt versions, fact-guard flags, earlier cover-letter versions.
alter table "JobMatch" add column if not exists "aiMeta" jsonb;

-- Requirement matching: [{text, must, skill, result: covered|partial|gap, note}], decided by code.
alter table "JobMatch" add column if not exists "requirements" jsonb;

-- Normalized posting link: the same ad found through two boards is stored once.
alter table "Job" add column if not exists "urlKey" text;
create index if not exists "Job_urlKey_idx" on "Job" ("urlKey");

-- In case the first draft of this migration was run (it had a text[] column that's no longer used).
alter table "JobMatch" drop column if exists "letterUnverified";
