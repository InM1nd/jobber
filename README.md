# Jobber

Jobber is a Telegram Mini App for job search. The same Next.js app on Vercel holds the UI, the bot webhook, and the cron routes. It fetches vacancies from public ATS APIs, scores them with **your** model key, drafts cover letters from your writing rules, and reminds you to follow up in the chat.

The owner tests it first. Friends get in with an invite code. Jobber does not pay for LLM calls.

## What works in this version

- Sign-in from Telegram WebApp `initData`, checked with HMAC-SHA256 and the bot token. `auth_date` older than 24 hours is rejected. A signed cookie is the session. Email magic link still works in a normal browser.
- Profile: PDF text extraction, skills, location and salary filters, skill gaps, writing rules, company watchlist.
- Pluggable sources with real parsers: Greenhouse, Ashby, Lever, Workable, Personio, Recruitee, SmartRecruiters, RSS/Teamtailor, and the public Remotive API. HTML-only and Join.com pages are stored but not fetched.
- Deduping the same company + title + location across sources.
- Daily Vercel cron: fetch a few sources per run, then score a few new vacancies per user, then send Telegram follow-ups. Progress for the fetch loop is stored in `CronJob`.
- Match scores (0–100), reasons, and red flags. Daily digest to Telegram for scores of 70+.
- Cover letters through one provider interface: OpenRouter, OpenAI, Anthropic, Gemini, or xAI. OpenRouter also has a PKCE start/callback.
- API keys encrypted with AES-256-GCM. The ciphertext is not returned to the browser and is not written to logs on purpose.
- Application tracker with statuses and a 7-day follow-up date.
- `/start` sends an Open Jobber button and sets the chat menu button to the Mini App. An invite can arrive as `/start CODE` or as `startapp` on the t.me link.
- Local demo mode when Supabase is not configured, so the screens can be clicked through with sample matches.

## What is stubbed

- OpenRouter's key exchange follows their documented PKCE callback (`POST /api/v1/auth/keys`). If their payload changes, the callback will say the exchange failed. There is no separate OpenRouter app id in this version.
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
5. Copy the Postgres connection string into `DATABASE_URL`. Use the direct connection string for Prisma, not the pooled one, if `db push` complains.

### 3. Environment

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth key |
| `SUPABASE_SERVICE_ROLE_KEY` | Reserved for server tasks. Not used by the browser |
| `ENCRYPTION_KEY` | 64 hex chars. `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `CRON_SECRET` | Random string. Vercel sends it as `Authorization: Bearer …` |
| `NEXT_PUBLIC_APP_URL` | Public origin, no trailing slash. Locally `http://127.0.0.1:43123` |
| `DEMO_MODE` | `false` once Supabase is set. `true` forces sample data |
| `OWNER_EMAIL` | Account the seed script creates, and the only person who can mint invites after more users exist |
| `SEED_INVITE_CODE` | Optional. Otherwise the seed script prints a random code |

Generate the two secrets:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 32   # CRON_SECRET
```

### 4. Database

```bash
npx prisma db push
```

Then run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor. That enables row level security. The Next.js server uses `DATABASE_URL` and bypasses RLS; the policies stop the public Supabase API from reading another user's rows. `ApiKey`, invite codes, and cron rows have RLS on and no client policy, so the browser cannot select them.

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
OWNER_EMAIL="you@example.com" npm run seed
```

The script prints an invite code. Sign in with the same email via the magic link. The callback attaches your Supabase user to that row.

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

Invite links look like `https://t.me/<bot>/<shortname>?startapp=CODE`. `/start CODE` also passes the code into the button URL. The seeded owner account is attached to the first Telegram user who opens the app with `OWNER_EMAIL`, without an invite. Everyone else needs a code.

### 7. Your model key

Settings → Connect OpenRouter, or paste a key for OpenRouter, OpenAI, Anthropic, Gemini, or xAI.

Inside Telegram, Connect OpenRouter calls `Telegram.WebApp.openLink`. The return page is shown in that browser and tells you to switch back to the chat. The key is stored from a signed `state` on the callback, so the Telegram webview does not have to share cookies with that browser. Pasting a key does not leave the Mini App.

### 8. Vercel

`vercel.json` schedules:

- `08:00 UTC` `/api/cron/fetch-jobs` — 5 companies per invocation, then continues next run
- `09:00 UTC` `/api/cron/match-jobs` — up to 5 users, 10 unscored jobs each
- `10:00 UTC` `/api/cron/follow-ups` — Telegram reminders

Set every variable from `.env.local` in the Vercel project, including `CRON_SECRET`. Vercel Cron must send `Authorization: Bearer $CRON_SECRET`. If your project does not inject that header, add a rewrite or a cron proxy that does. The routes reject anything else.

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
- `app/api/auth/openrouter` — PKCE start and callback
- `lib/sources` — one parser per ATS
- `lib/llm` — provider client, scoring, letters
- `lib/crypto` — AES-256-GCM
- `prisma/schema.prisma` — tables
- `scripts/seed-profile.ts` — local profile + watchlist
- `examples/company_watchlist.json` — public example watchlist
