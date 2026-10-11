-- Jobber schema for an empty Supabase database.
-- Paste this whole file into the Supabase SQL Editor and run it once.
--
-- Schema DDL is the output of:
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- with two re-run guards: IF NOT EXISTS on tables and indexes, and
-- duplicate_object ignored on foreign keys.
-- Row level security follows supabase/migrations/001_initial_schema.sql.
-- Policies are dropped first so a second paste replaces them instead of failing.
--
-- This file does not insert an invite code. The owner is OWNER_TELEGRAM_ID.
--
-- Supabase already has auth.uid() and the authenticated role. The guards
-- below create them only when they are missing, so the same file also
-- applies on a local Postgres. Supabase's auth.uid() is not replaced.

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS auth;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'uid'
  ) THEN
    EXECUTE $sql$
      CREATE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      AS $body$
        SELECT NULL::uuid
      $body$
    $sql$;
  END IF;
END
$guard$;

BEGIN;

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "supabaseId" TEXT,
    "telegramId" TEXT,
    "telegramUsername" TEXT,
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cvText" TEXT,
    "cvFileName" TEXT,
    "skills" TEXT[],
    "location" TEXT,
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "countryEligible" TEXT,
    "languages" TEXT[],
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "stackKeywords" TEXT[],
    "skillGaps" TEXT[],
    "writingRules" TEXT,
    "watchedCompanies" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobSource" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sector" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "careersUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Job" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "postedAt" TIMESTAMP(3),
    "url" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT[],
    "redFlags" TEXT[],
    "priority" TEXT NOT NULL,
    "coverLetter" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'to_apply',
    "appliedAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "followUpSent" BOOLEAN NOT NULL DEFAULT false,
    "contact" TEXT,
    "salaryExpectation" TEXT,
    "notes" TEXT,
    "coverLetter" TEXT,
    "cvVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedBy" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CronJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "currentBatch" INTEGER NOT NULL DEFAULT 0,
    "totalBatches" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_supabaseId_key" ON "User"("supabaseId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobSource_isActive_idx" ON "JobSource"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobSource_company_sourceUrl_key" ON "JobSource"("company", "sourceUrl");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Job_isActive_idx" ON "Job"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Job_postedAt_idx" ON "Job"("postedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Job_dedupeKey_idx" ON "Job"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Job_sourceId_externalId_key" ON "Job"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobMatch_userId_score_idx" ON "JobMatch"("userId", "score");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobMatch_userId_jobId_key" ON "JobMatch"("userId", "jobId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Application_followUpAt_idx" ON "Application"("followUpAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InviteCode_code_key" ON "InviteCode"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InviteCode_code_idx" ON "InviteCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CronJob_name_key" ON "CronJob"("name");

-- AddForeignKey
DO $fk$
BEGIN
  ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

-- AddForeignKey
DO $fk$
BEGIN
  ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

-- AddForeignKey
DO $fk$
BEGIN
  ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

-- AddForeignKey
DO $fk$
BEGIN
  ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

-- AddForeignKey
DO $fk$
BEGIN
  ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

-- AddForeignKey
DO $fk$
BEGIN
  ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

-- AddForeignKey
DO $fk$
BEGIN
  ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

-- Row level security from supabase/migrations/001_initial_schema.sql.
-- The Next.js server connects with DATABASE_URL and bypasses RLS; every
-- server query still filters by the signed-in user id.
-- ApiKey, InviteCode, and CronJob have no policies on purpose.
-- With RLS enabled and no policy, the public API cannot read them.
-- The server writes them through Prisma.
-- No invite code is inserted. Set OWNER_TELEGRAM_ID in the app environment.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobMatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InviteCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CronJob" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own user row" ON "User";
CREATE POLICY "Users can view own user row"
  ON "User" FOR SELECT
  USING (auth.uid()::text = "supabaseId");

DROP POLICY IF EXISTS "Users can update own user row" ON "User";
CREATE POLICY "Users can update own user row"
  ON "User" FOR UPDATE
  USING (auth.uid()::text = "supabaseId");

DROP POLICY IF EXISTS "Users can view own profile" ON "Profile";
CREATE POLICY "Users can view own profile"
  ON "Profile" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Profile"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can insert own profile" ON "Profile";
CREATE POLICY "Users can insert own profile"
  ON "Profile" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Profile"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can update own profile" ON "Profile";
CREATE POLICY "Users can update own profile"
  ON "Profile" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Profile"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can view own matches" ON "JobMatch";
CREATE POLICY "Users can view own matches"
  ON "JobMatch" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "JobMatch"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can view own applications" ON "Application";
CREATE POLICY "Users can view own applications"
  ON "Application" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Application"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can insert own applications" ON "Application";
CREATE POLICY "Users can insert own applications"
  ON "Application" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Application"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can update own applications" ON "Application";
CREATE POLICY "Users can update own applications"
  ON "Application" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Application"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can delete own applications" ON "Application";
CREATE POLICY "Users can delete own applications"
  ON "Application" FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Application"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view job sources" ON "JobSource";
CREATE POLICY "Authenticated users can view job sources"
  ON "JobSource" FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can view jobs" ON "Job";
CREATE POLICY "Authenticated users can view jobs"
  ON "Job" FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
