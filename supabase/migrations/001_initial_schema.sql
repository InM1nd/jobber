-- Run this AFTER `npx prisma db push`.
-- Prisma creates the tables. This file turns on Row Level Security so the
-- Supabase anon/authenticated API cannot read another person's rows.
-- The Next.js server connects with DATABASE_URL (transaction pooler) and bypasses RLS; every
-- server query still filters by the signed-in user id.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobMatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InviteCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CronJob" ENABLE ROW LEVEL SECURITY;

-- ApiKey, InviteCode, and CronJob have no policies on purpose.
-- With RLS enabled and no policy, the public API cannot read them.
-- The server writes them through Prisma.

CREATE POLICY "Users can view own user row"
  ON "User" FOR SELECT
  USING (auth.uid()::text = "supabaseId");

CREATE POLICY "Users can update own user row"
  ON "User" FOR UPDATE
  USING (auth.uid()::text = "supabaseId");

CREATE POLICY "Users can view own profile"
  ON "Profile" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Profile"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own profile"
  ON "Profile" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Profile"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own profile"
  ON "Profile" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Profile"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can view own matches"
  ON "JobMatch" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "JobMatch"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can view own applications"
  ON "Application" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Application"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own applications"
  ON "Application" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Application"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own applications"
  ON "Application" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Application"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own applications"
  ON "Application" FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "User"
      WHERE "User".id = "Application"."userId"
        AND "User"."supabaseId" = auth.uid()::text
    )
  );

CREATE POLICY "Authenticated users can view job sources"
  ON "JobSource" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view jobs"
  ON "Job" FOR SELECT
  TO authenticated
  USING (true);
