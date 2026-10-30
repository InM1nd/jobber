-- 007: interview time on the application, and how long "no reply" waits before it counts.
-- Idempotent: safe to run more than once. Run AFTER 006_profile_facts.sql.

alter table "Application" add column if not exists "interviewAt" timestamptz;

alter table "Profile" add column if not exists "quietDays" integer not null default 14;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Profile_quietDays_check') then
    alter table "Profile"
      add constraint "Profile_quietDays_check"
      check ("quietDays" in (3, 5, 7, 10, 14, 21, 30));
  end if;
end $$;

-- Copy the latest "(interview <ISO>)" out of notes. A bad timestamp is skipped, not fatal.
create or replace function jobber_interview_ts(notes text) returns timestamptz
language plpgsql as $$
declare
  m text;
  ts timestamptz;
begin
  if notes is null then return null; end if;
  for m in
    select (regexp_matches(notes, '\(interview (\d{4}-\d{2}-\d{2}T[^)]+)\)', 'g'))[1]
  loop
    begin
      ts := m::timestamptz;
    exception when others then
      null;
    end;
  end loop;
  return ts;
end $$;

update "Application"
set "interviewAt" = jobber_interview_ts("notes")
where "interviewAt" is null
  and "notes" ~ '\(interview ';

drop function jobber_interview_ts(text);
