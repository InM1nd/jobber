# Jobber

Jobber is a Telegram Mini App for job search. The same Next.js app on Vercel holds the UI, the bot webhook, and the cron routes. It fetches vacancies from public ATS APIs, scores them on the owner's shared Gemini key (`GEMINI_API_KEY`, free tier), drafts cover letters and per-job CV advice, and reminds you to follow up in the chat, and reminds you to follow up in the chat.

The owner tests it first. Friends get in with an invite code. Nobody pastes keys: AI runs server-side on one shared Gemini key with per-user daily quotas.

## What works in this version

- Sign-in from Telegram WebApp `initData`, checked with HMAC-SHA256 and the bot token. `auth_date` older than 24 hours is rejected. A signed cookie is the session. The owner is the Telegram account in `OWNER_TELEGRAM_ID`, or the first account that opens the app with the seed invite. Email magic link still works in a normal browser.
- Profile: PDF text extraction, skills, location and salary filters, skill gaps, writing rules, company watchlist.
- Pluggable sources with real parsers: Greenhouse, Ashby, Lever, Workable, Personio, Recruitee, SmartRecruiters, RSS/Teamtailor, and the public Remotive API. HTML-only and Join.com pages are stored but not fetched.
- Deduping the same company + title + location across sources.
- Daily Vercel cron: fetch a few sources per run, then score a few new vacancies per user, then send Telegram follow-ups. Progress for the fetch loop is stored in `CronJob`.
- Match scores (0–100), reasons, and red flags. Daily digest to Telegram for scores of 70+.
- CV-first onboarding (`/dashboard/onboarding`): upload a PDF or paste text → Gemini extracts a structured profile (validated with zod) → the user edits a "Here's what I understood" card → Jobber builds a search plan (titles, keywords, and companies picked **only** from `lib/companies/seed.json`, a curated list of boards verified to return jobs by `scripts/verify-seed.mjs`) → the first fetch + score runs immediately in small steps (`/api/search/step`), with a progress card. A Telegram message with the top matches goes out when the first run finishes.
- Keyword boards without a watchlist: Remotive, Jobicy, Himalayas (search API) and Arbeitnow (keyword-filtered).
- Rule pre-filter before any AI call (`lib/jobs/prefilter.ts`): title/role family, seniority, German-language requirements, on-site city, region-locked remote.
- Shared Gemini (`lib/ai/gemini.ts`): smart model (`GEMINI_MODEL`, default `gemini-3.5-flash`) for CV parsing, plans, letters and CV advice; lite model (`GEMINI_MODEL_LITE`, default `gemini-3.5-flash-lite`) for bulk scoring. Per-model sliding-window limiter (`GEMINI_RPM_SMART`=5, `GEMINI_RPM_LITE`=15), retries with RetryInfo backoff on 429, a cross-instance backoff row after long 429s, fallback smart→lite on 503/404. Whatever isn't scored waits for the next cron run.
- Per-user daily quotas (`AiUsage` table): `AI_DAILY_SCORES` (60), `AI_DAILY_WRITES` (12, letters + CV advice + tailored CV), `AI_DAILY_CV_PARSES` (4).
- "Tailor CV" on each match: concrete emphasise/add/reword suggestions, missing keywords, and a "don't claim" list; optional tailored CV text. Cached per user+job on `JobMatch`.
- Database change for this version: run `supabase/migrations/002_shared_ai_onboarding.sql` in the Supabase SQL editor (idempotent).
- Application tracker with statuses and a 7-day follow-up date.
- `/start` sends an Open Jobber button and sets the chat menu button to the Mini App. An invite can arrive as `/start CODE` or as `startapp` on the t.me link.
- Local demo mode when Supabase is not configured, so the screens can be clicked through with sample matches.

## What is stubbed

- Sources marked `html` or `join` in the watchlist have no adapter. The cron records that on the source row instead of scraping the page.
- SmartRecruiters stores the list payload (title, location, url). The long description needs a second request and is not fetched yet.
- There is no separate `/link` step. Opening the Mini App is the account.
- Profile editing of an uploaded CV is replace-only. There is no rich CV editor.
- Demo mode keeps data in the server process. It is for clicking through the UI, not a second database.

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **Authentication → Providers → Email**, keep email enabled. Magic links are the login method.
3. In **Authentication → URL configuration**, add `https://<your-domain>/auth/callback` and `http://127.0.0.1:43123/auth/callback`.
4. Copy the project URL, anon key, and service role key.
5. In **Project Settings → Database**, copy both pooler strings (see the next section). Prisma Client talks to the transaction pooler. The session pooler string still belongs in `DIRECT_URL` because `prisma generate` reads it. The tables themselves are created by pasting `supabase/setup.sql` in the SQL Editor, not by `prisma db push`.

### 3. Environment

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler, port 6543, with `?pgbouncer=true`. Prisma Client uses this for every query |
| `DIRECT_URL` | Supabase session pooler, port 5432. Prisma reads this at `prisma generate`. The schema is applied from `supabase/setup.sql`, not from a database connection |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth key |
| `SUPABASE_SERVICE_ROLE_KEY` | Reserved for server tasks. Not used by the browser |
| `ENCRYPTION_KEY` | 64 hex chars. `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `CRON_SECRET` | Random string. Vercel sends it as `Authorization: Bearer …` |
| `NEXT_PUBLIC_APP_URL` | Public origin, no trailing slash. Locally `http://127.0.0.1:43123` |
| `DEMO_MODE` | `false` once Supabase is set. `true` forces sample data |
| `OWNER_TELEGRAM_ID` | Numeric Telegram id of the owner. That account opens the app without an invite and is the only one who can mint invites. Leave empty to use the seed invite instead |
| `SEED_INVITE_CODE` | Optional. Otherwise the seed script prints a random code. The first Telegram user who opens the app with this code is the owner when `OWNER_TELEGRAM_ID` is empty |

Generate the two secrets:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 32   # CRON_SECRET
```

### 4. Database

The Supabase database starts empty, and this project does not open a Postgres connection to push the schema. In the Supabase **SQL Editor**, paste `supabase/setup.sql` and run it once.

That file is the full schema from:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

followed by the row level security statements in `supabase/migrations/001_initial_schema.sql`. Tables and indexes are created only when they are missing, existing foreign keys are left in place, and each policy is dropped and recreated, so pasting it again does not duplicate them. Do not run `001_initial_schema.sql` on its own afterward. It is already included, and by itself it expects the tables to exist.

The script does not insert an invite code. Set `OWNER_TELEGRAM_ID` to your numeric Telegram id. That account is the owner and can open the Mini App without an invite.

`DATABASE_URL` is the transaction pooler (`:6543/postgres?pgbouncer=true`). The Next.js server uses it and bypasses RLS. The policies stop the public Supabase API from reading another user's rows. `ApiKey`, invite codes, and cron rows have RLS on and no client policy, so the browser cannot select them. `DIRECT_URL` stays set because `prisma generate` reads it. Queries do not use it.

### 5. Your profile (kept out of git)

`seed-data/` is gitignored.

```bash
mkdir -p seed-data
# copy your profile markdown, writing rules, and optional watchlist:
# seed-data/alexander_profile.md
# seed-data/job_search_rules.md
# seed-data/company_watchlist.json
```

If the watchlist file is missing, the script uses `examples/company_watchlist.json` (public career URLs only).

```bash
npm run seed
```

The script prints an invite code and seeds job sources. It does not create an email account. Set `OWNER_TELEGRAM_ID` to your numeric Telegram id and the script writes the local profile onto that Telegram user. If the id is empty, open the Mini App with the printed invite first, then run the seed again so the profile lands on that account.

### 6. Telegram Mini App

`NEXT_PUBLIC_APP_URL` must be HTTPS before Telegram will open it. `http://127.0.0.1` is only for the browser demo.

1. Talk to [@BotFather](https://t.me/botfather) and send `/newbot`. Put the token in `TELEGRAM_BOT_TOKEN`. The same token validates Mini App `initData`.
2. Send `/newapp`, pick the bot, and set the Web App URL to `https://YOUR_DOMAIN/dashboard/matches`. Note the short name. Put the bot username in `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` and the short name in `TELEGRAM_MINI_APP_SHORT_NAME`.
3. Optional: `/setmenubutton` with the same URL and the text `Open`. `/start` also sets that menu button for the chat.
4. `/setcommands`:

```
start - Open Jobber
help - Show commands
matches - Recent scores
profile - Profile summary
reminders - Follow-ups that are due
```

5. After deploy, set the webhook:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR_DOMAIN/api/telegram"}'
```

Invite links look like `https://t.me/<bot>/<shortname>?startapp=CODE`. `/start CODE` also passes the code into the button URL. The owner is `OWNER_TELEGRAM_ID`, or, when that is empty, the first Telegram user who opens the app with the seed invite. Only the owner can mint further invites. Everyone else needs a code.

### 7. Your model key

Settings → paste a key for OpenAI, Anthropic, Gemini, or xAI.

Pasting a key does not leave the Mini App.

### 8. Vercel

`vercel.json` schedules:

- `08:00 UTC` `/api/cron/fetch-jobs` — 5 companies per invocation, then continues next run
- `09:00 UTC` `/api/cron/match-jobs` — up to 5 users, 10 unscored jobs each
- `10:00 UTC` `/api/cron/follow-ups` — Telegram reminders

Set every variable from `.env.local` in the Vercel project, including `DATABASE_URL`, `DIRECT_URL`, and `CRON_SECRET`. `prisma generate` reads both database URLs from the schema even though queries only use `DATABASE_URL`. Vercel Cron must send `Authorization: Bearer $CRON_SECRET`. If your project does not inject that header, add a rewrite or a cron proxy that does. The routes reject anything else.

### 9. Run locally

```bash
npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123).

Without Supabase variables the app stays in demo mode: sample matches, a sample letter, and forms that write to memory for this process.

## Tests

```bash
npm test
npm run typecheck
npm run build
```

Tests cover AES-GCM roundtrip, salary and ATS parsers (Greenhouse, Ashby, Lever, Workable, Personio, Recruitee, Remotive, RSS, SmartRecruiters), dedupe keys, and the match/cover-letter prompt plus JSON parsing. They do not call live job boards or model APIs.

## Project map

- `app/(dashboard)` — Matches, Tracker, Profile, Settings
- `app/api/telegram` — grammY webhook
- `app/api/cron` — fetch, match, follow-up
- `lib/sources` — one parser per ATS
- `lib/llm` — provider client, scoring, letters
- `lib/crypto` — AES-256-GCM
- `prisma/schema.prisma` — tables
- `scripts/seed-profile.ts` — local profile + watchlist
- `examples/company_watchlist.json` — public example watchlist
