-- Shared Gemini + CV-first onboarding. Idempotent: safe to run twice.
alter table "Profile" add column if not exists "fullName" text;
alter table "Profile" add column if not exists "targetRoles" text[] not null default '{}';
alter table "Profile" add column if not exists "seniority" text;
alter table "Profile" add column if not exists "yearsExperience" integer;
alter table "Profile" add column if not exists "searchKeywords" text[] not null default '{}';
alter table "Profile" add column if not exists "sourceIds" text[] not null default '{}';
alter table "Profile" add column if not exists "onboardedAt" timestamp(3);

alter table "Job" add column if not exists "company" text;

alter table "JobMatch" add column if not exists "cvAdvice" jsonb;
alter table "JobMatch" add column if not exists "tailoredCv" text;
alter table "JobMatch" add column if not exists "filtered" boolean not null default false;
create index if not exists "JobMatch_userId_filtered_idx" on "JobMatch" ("userId", "filtered");

create table if not exists "AiUsage" (
  "id" text primary key,
  "userId" text not null references "User"("id") on delete cascade on update cascade,
  "day" text not null,
  "kind" text not null,
  "count" integer not null default 0,
  "updatedAt" timestamp(3) not null
);
create unique index if not exists "AiUsage_userId_day_kind_key" on "AiUsage" ("userId", "day", "kind");

create table if not exists "SearchRun" (
  "id" text primary key,
  "userId" text not null references "User"("id") on delete cascade on update cascade,
  "status" text not null default 'fetching',
  "sourceIds" text[] not null default '{}',
  "sourcesDone" integer not null default 0,
  "jobsFound" integer not null default 0,
  "filtered" integer not null default 0,
  "scored" integer not null default 0,
  "queued" integer not null default 0,
  "note" text,
  "notifiedAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null
);
create index if not exists "SearchRun_userId_createdAt_idx" on "SearchRun" ("userId", "createdAt");

alter table "AiUsage" enable row level security;
alter table "SearchRun" enable row level security;
