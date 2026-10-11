-- Iteration 2: guided profile form, multiple CVs, scoring sub-scores, shared AI budget.
-- Idempotent. Run AFTER 002_shared_ai_onboarding.sql.
alter table "Profile" add column if not exists "workField" text;
alter table "Profile" add column if not exists "country" text;
alter table "Profile" add column if not exists "openTo" text[] not null default '{city,country,remote}';
alter table "Profile" add column if not exists "stretch" boolean not null default false;
alter table "Profile" add column if not exists "employmentTypes" text[] not null default '{}';
alter table "Profile" add column if not exists "avoidKeywords" text[] not null default '{}';
alter table "Profile" add column if not exists "excludeCompanies" text[] not null default '{}';
alter table "Profile" add column if not exists "scoringInstructions" text;
alter table "Profile" add column if not exists "minScore" integer not null default 0;
alter table "Profile" add column if not exists "alertThreshold" integer not null default 70;
alter table "Profile" add column if not exists "alertFrequency" text not null default 'daily';
alter table "Profile" add column if not exists "maxJobAgeDays" integer not null default 45;

alter table "JobMatch" add column if not exists "cvId" text;
alter table "JobMatch" add column if not exists "locationTier" text;
alter table "JobMatch" add column if not exists "subScores" jsonb;

create table if not exists "Cv" (
  "id" text primary key,
  "userId" text not null references "User"("id") on delete cascade on update cascade,
  "label" text not null,
  "fileName" text,
  "text" text not null,
  "parsed" jsonb,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null
);
create index if not exists "Cv_userId_idx" on "Cv" ("userId");

create table if not exists "GlobalAiUsage" (
  "day" text not null,
  "model" text not null,
  "count" integer not null default 0,
  "updatedAt" timestamp(3) not null,
  primary key ("day", "model")
);

alter table "Cv" enable row level security;
alter table "GlobalAiUsage" enable row level security;
