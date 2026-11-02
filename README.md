# Jobber

Jobber is a job-search assistant that lives in a Telegram Mini App (and a normal browser). One Next.js app on Vercel holds the UI, the Telegram bot webhook, the cron jobs and a private API for agents. Data lives in Supabase Postgres.

It collects vacancies from public job APIs, company ATS boards and an outside agent (Grok Bot), filters and scores them against your profile, shows the best ones in **Matches**, and keeps everything you act on in the **Tracker** — with cover letters, form answers, follow-up reminders and employer replies handled for you.

The owner tests it first. Friends get in with an invite code. Nobody has to paste keys: AI runs server-side on one shared Gemini key with per-user daily quotas (an own free Gemini key lifts them).

## How it works

```
 Sources ─┐
 (ATS boards, keyword boards,   ┌───────────┐   rules    ┌──────────┐  AI score   ┌─────────┐   you decide   ┌─────────┐
  JSearch, scrapers, HN)        │ Job pool  │──────────▶│ pre-score │───────────▶│ Matches │──────────────▶│ Tracker │
 Grok Bot ─ /api/agent/jobs ───▶│ (deduped) │  (free)    └──────────┘  (Gemini)   └─────────┘                └─────────┘
 "Add job by link" ────────────▶└───────────┘                                         │                         │
                                                                     Telegram digest ◀┘     follow-ups, replies,┘
                                                                                             interviews, drafts
```

1. **Fetch.** `cron/fetch-jobs` (08:00 and 14:00 UTC) pulls every due source in parallel within a time budget. Jobs are stored once in `Job`, deduped by posting link and by company + title + place. On company ATS boards (Greenhouse, Lever, Ashby, Workable, Personio, Recruitee, Teamtailor, BambooHR) a job that disappears from the board is marked inactive: it leaves Matches, digests and drafts, and the tracker says "Listing taken down".
2. **Filter (free).** `lib/jobs/prefilter.ts` drops clear mismatches before any AI call: role family, seniority, required German level, on-site city, region-locked remote, excluded companies and keywords, job age. A deterministic pre-score ranks the rest; skipped jobs are listed with the reason and a "Score anyway" button.
3. **Score (AI).** `cron/match-jobs` (09:00 and 15:00 UTC) sends the best candidates to Gemini flash-lite, 12 jobs per request (`lib/search/score.ts`, `rubric.ts`). The model rates role fit and skills and lists the job's key requirements; code rates seniority, location tier, language (CEFR) and salary; weights 30/30/15/10/7/8, and a low role fit caps the total. Your recent tracker decisions — including *why* you skipped something — calibrate the model (`calibration.ts`). Then the newest strong matches (≥ 70) get a second look with Flash (`rescore.ts`, shared Flash budget ≈ 18/day).
4. **Re-score.** Changing the profile fields the rules or scorer read (roles, level, skills, languages, place, exclusions, scoring rules) or adding/removing a CV re-checks skipped jobs and re-scores the 24 best shown matches. They stay visible, marked "re-scoring soon", until then.
5. **Alert.** A daily Telegram digest for scores above your threshold; instant alerts if you chose them.
6. **Act.** In the Tracker: cover letter and application-form drafts, follow-up reminders, forwarded employer replies, interviews to the calendar.

## The Tracker (your main board)

`/dashboard/tracker` is the board where applications live. Each row is one `Application` in Supabase.

**Statuses:** To apply → Check listing → Applied → Interview → On hold → Offer, plus Rejected and Skip. Tabs group them (active / closed); a funnel card shows applied → reply → interview → offer rates and applications per week.

**Who writes to it** (all through the server; the browser never talks to Supabase directly):

| Writer | How |
| --- | --- |
| You, in the app | "Add" form, status pill, dates, priority, notes, skip reason (`/api/applications`) |
| Telegram bot | Status buttons and Undo, forwarded employer replies (`lib/replies`) |
| Cron | Follow-up reminders (`cron/follow-ups`), agent drafts (`cron/agent-drafts`) |
| Grok Bot | Status changes on real events via `PATCH /api/agent/applications/<id>` (new vacancies go to `/api/agent/jobs`, not here) |
| Claude (MCP) | `list_applications`, `get_application`, `upsert_application`, `update_status` (writes only with `AGENT_API_KEY_CLAUDE_WRITE=true`) |

**Linking.** An application is linked to the matching `Job` (same normalized URL, or same company + role; `lib/tracker/link.ts`). The link hides that job from Matches once you applied, shows its fit score and requirement coverage on the tracker card, and tells you when the company takes the listing down.

**Skip reasons.** When a row is Skip, the card offers Level / Stack / Language / Location / Salary / Company / Role type / Contract. The reason is kept as a `Skipped: …` line in the notes and teaches the scoring what to avoid.

**Known gap:** there is no "move to tracker" button on a match yet — matches enter the tracker by hand or through the agent. A swipe deck (right = apply, left = not for me) is planned to close this.

## Data (Supabase)

The app talks to Postgres through Prisma over the Supabase transaction pooler (`DATABASE_URL`) and bypasses RLS; RLS is on so the public Supabase API can't read anyone's rows. `ApiKey`, invite codes and cron rows have no client policy at all.

| Table | What it holds |
| --- | --- |
| `User` | Telegram id / email, invites |
| `Profile` | The guided profile: roles, level, skills, languages, place, salary, exclusions, scoring rules, facts, alert settings, which sources to search |
| `Cv` | Several labelled CVs; scoring picks the best one per job |
| `JobSource` | One row per ATS board, keyword search, scraper query or agent ("Found by Grok") |
| `Job` | The shared, deduped job pool (`isActive` = still listed) |
| `JobMatch` | One job scored for one user: score, sub-scores, reasons, red flags, requirements, letter + versions (`aiMeta`), CV advice. `filtered` = skipped by rules or queued for AI |
| `Application` | The tracker |
| `AiUsage`, `GlobalAiUsage` | Per-user and shared daily AI counters |
| `SearchRun`, `CronJob` | Onboarding search progress, cron state and backoff |

## Getting vacancies from Grok Bot (agent API)

The owner's agent sends what it finds to the **job pool**, not the tracker; Jobber dedupes, filters and scores it like any other source and shows it in Matches as "found by Grok" with the agent's note. Agent picks skip the pre-score cut and go first in the scoring queue (the hard rules still apply).

- `POST /api/agent/jobs` — one vacancy or `{items:[…]}` (≤ 25). Best with `title + company + description` (no page fetch, no AI extraction); a bare `url` works too.
- `GET /api/agent/jobs?jobIds=…` — queued / skipped (+ reason) / scored (+ score) for jobs sent earlier.
- `GET|POST /api/agent/applications`, `GET|PATCH /api/agent/applications/<id>` — read the tracker, change status on real events (`skipReason` supported).

Auth: `Authorization: Bearer $AGENT_API_KEY`. Full request examples: [`mcp/README.md`](mcp/README.md). The same file sets up the Claude MCP connector (stdio server in `mcp/`, or the remote endpoint `/api/mcp`).

## Features at a glance

- Telegram sign-in from Mini App `initData` (HMAC with the bot token, 24 h max age), signed-cookie session; web sign-in through the bot; email magic link still works.
- CV-first onboarding: PDF or text → structured profile (zod-validated) → editable "Here's what I understood" card → search plan built only from verified boards (`lib/companies/seed.json`) → first fetch + score in small serverless-safe steps with a progress card.
- Guided profile form (source of truth), several CVs, "Facts about me", writing rules, company watch list with ATS auto-detection.
- Sources: Greenhouse, Lever, Ashby, Workable, Personio, Recruitee, SmartRecruiters, Teamtailor/RSS, BambooHR, Workday; keyword boards Remotive, Jobicy, Himalayas, Arbeitnow, RemoteOK, We Work Remotely, Working Nomads, The Muse, Bundesagentur, Adzuna, Jooble, HN "Who is hiring?"; JSearch (Google for Jobs: LinkedIn, Indeed…) with each user's own key; owner-only Austrian scrapers (karriere.at, StepStone, derStandard); Grok Bot.
- Matches: score with breakdown, requirement coverage, red flags, best CV, "via LinkedIn" / "found by Grok", Flash double-check note.
- Writing: cover letters with versions, paragraph rewrites and refine chips; tailored-CV advice that only quotes the real CV; application-form drafts from real ATS questions; a fact guard flags names, numbers and links nothing backs up. Agent drafts write letters for the best new matches each morning (never sent).
- Replies: forward an employer email to the bot → status, note, next step and interview time are updated (with Undo) and a draft answer comes back; interviews to Google Calendar / `.ics`.
- Weekly source-health report to the owner (Mondays): sources that fail, went stale or have no open jobs.
- SSRF-safe fetching of user links; AES-256-GCM for stored keys; demo mode without Supabase.

## AI budget

Flash-lite does everything by default; Flash is used only for the daily double-check of top matches (and as an optional fallback with `GEMINI_FLASH_FALLBACK=true`).

| | Default |
| --- | --- |
| Shared daily budget | `GEMINI_RPD_LITE`=500, `GEMINI_RPD_FLASH`=20, margin `GEMINI_RPD_MARGIN`=20, `GEMINI_ONBOARDING_RESERVE`=80 |
| Per user, shared key | `AI_DAILY_SCORE_CALLS`=6 (×12 jobs), `AI_DAILY_WRITES`=4, `AI_DAILY_CV_PARSES`=5 |
| Per user, own key | `AI_BYO_DAILY_SCORE_CALLS`=80, `AI_BYO_DAILY_WRITES`=60, `AI_BYO_DAILY_CV_PARSES`=20 |
| Scoring | `AI_PRESCORE_MIN`=40, `AI_TOP_CANDIDATES`=24 per run, `AI_RESCORE_TOP`=24, `AI_VERIFY_MIN`=70, `AI_VERIFY_TOP`=5 (0 = off) |

## Cron (vercel.json, UTC)

| Time | Route | What |
| --- | --- | --- |
| 08:00 | `/api/cron/fetch-jobs` | Fetch due sources, close taken-down jobs, daily digest, Monday source report |
| 09:00 | `/api/cron/match-jobs` | Filter + score, Flash double-check |
| 09:40 | `/api/cron/agent-drafts` | Letters for the best new matches (owner) |
| 10:00 | `/api/cron/follow-ups` | Telegram follow-up reminders |
| 14:00 | `/api/cron/fetch-jobs?slot=2` | Second fetch |
| 15:00 | `/api/cron/match-jobs?slot=2` | Score the second fetch |

Every cron route requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it).

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → Providers → Email**: keep email enabled (magic links).
3. **Authentication → URL configuration**: add `https://<your-domain>/auth/callback` and `http://127.0.0.1:43123/auth/callback`.
4. Copy the project URL, anon key and service role key, and both pooler strings from **Project Settings → Database**.

### 3. Database

In the Supabase **SQL Editor**, paste `supabase/setup.sql` once (full schema + RLS; safe to run again). On an existing database, run the migrations you don't have yet, in order — each is idempotent:

`002_shared_ai_onboarding` → `003_guided_form_multi_cv` → `004_speedup_prescore` → `005_agent_api` → `006_profile_facts` → `007_interview_quiet`

The app never pushes the schema itself. **Run new migrations before deploying code that needs them** — Prisma selects every column, so a missing one breaks pages.

### 4. Environment

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler, port 6543, `?pgbouncer=true` (all queries) |
| `DIRECT_URL` | Supabase session pooler, port 5432 (read by `prisma generate`) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth (email sign-in) |
| `SUPABASE_SERVICE_ROLE_KEY` | Reserved for server tasks |
| `ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`), encrypts stored keys |
| `TELEGRAM_BOT_TOKEN` | From BotFather; also the HMAC key for `initData` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `TELEGRAM_MINI_APP_SHORT_NAME` | Bot username (no @) and Mini App short name |
| `CRON_SECRET` | Random string; Vercel Cron sends it as a Bearer token |
| `NEXT_PUBLIC_APP_URL` | Public origin, no trailing slash |
| `OWNER_TELEGRAM_ID` | Owner's numeric Telegram id: opens without invite, mints invites, owns the agent API. **Required for the agent API.** |
| `SEED_INVITE_CODE` | Optional; first user with it becomes owner when `OWNER_TELEGRAM_ID` is empty |
| `DEMO_MODE` | `false` once Supabase is set |
| `GEMINI_API_KEY` (or `GEMINI_API_KEYS`) | Shared AI key(s), server-side only. `GEMINI_MODEL_LITE`, `GEMINI_MODEL` pick models |
| `AGENT_API_KEY` | Grok Bot's key for `/api/agent/*` (full access) |
| `AGENT_API_KEY_CLAUDE`, `AGENT_API_KEY_CLAUDE_WRITE`, `MCP_URL_TOKEN` | Claude connector: read-only key, opt-in writes, secret MCP URL |
| `AGENT_DRAFTS`, `AGENT_DRAFTS_ALL`, `AGENT_DRAFTS_PER_DAY`, `AGENT_DRAFTS_MIN_SCORE` | Morning letter drafts |
| `JSEARCH_API_KEY`, `JSEARCH_HOST`, `JSEARCH_MONTHLY_LIMIT`, `JSEARCH_KEYWORDS`, `JSEARCH_SOURCE` | JSearch (owner key; users add their own in Settings) |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY`, `HN_SOURCE` | Optional boards |
| `OWNER_SCRAPERS`, `SCRAPER_*` | Owner-only Austrian scrapers and their limits |

### 5. Your profile (kept out of git)

`seed-data/` is gitignored. Put your profile markdown, writing rules and optional watch list there, then:

```bash
npm run seed
```

The script seeds job sources and writes the profile onto the `OWNER_TELEGRAM_ID` user (open the Mini App once first if that user doesn't exist yet). Without a watch list it uses `examples/company_watchlist.json`.

### 6. Telegram

`NEXT_PUBLIC_APP_URL` must be HTTPS for Telegram.

1. [@BotFather](https://t.me/botfather) → `/newbot` → token into `TELEGRAM_BOT_TOKEN`.
2. `/newapp` → Web App URL `https://YOUR_DOMAIN/dashboard/matches`; the short name into `TELEGRAM_MINI_APP_SHORT_NAME`.
3. `/setcommands`:
   ```
   start - Open Jobber
   help - Show commands
   matches - Recent scores
   profile - Profile summary
   reminders - Follow-ups that are due
   ```
4. After deploy, point the webhook at the app:
   ```bash
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H "Content-Type: application/json" -d '{"url":"https://YOUR_DOMAIN/api/telegram"}'
   ```

Web sign-in uses the bot too: "Sign in with Telegram" opens `t.me/<bot>?start=login_<token>`. Invite links look like `https://t.me/<bot>/<shortname>?startapp=CODE`.

### 7. AI keys

Nothing to paste for users: the shared `GEMINI_API_KEY` runs everything within the quotas above. In **Settings**, a user can add their own free Gemini key (checked with `models.list`, stored AES-256-GCM encrypted) for bigger limits, and a JSearch key for LinkedIn/Indeed results.

### 8. Vercel

Set every variable in the Vercel project (Production; Preview if you use it). Region `dub1`, next to Supabase eu-west-1. Pushing to `main` deploys production.

### 9. Run locally

```bash
npm run dev     # http://127.0.0.1:43123
```

Without Supabase variables the app runs in demo mode with sample data kept in memory.

## Tests

```bash
npm test
npm run typecheck
npm run build
```

Unit tests cover the parsers for every source, dedupe, the pre-filter, the rubric and requirement matching, AI-reply salvage, calibration and skip reasons, closing taken-down jobs, re-score triggers, source health, the agent API input, encryption, Telegram auth and the tracker helpers. They don't call live boards or model APIs; `scripts/verify-sources.mts` and `scripts/verify-seed.mjs` check sources live.

## Project map

- `app/(dashboard)/dashboard` — Matches, Tracker, Profile, Settings, Onboarding
- `app/api/cron` — fetch, match, agent drafts, follow-ups
- `app/api/agent`, `app/api/mcp` — agent API and remote MCP endpoint; `mcp/` — stdio MCP server
- `app/api/telegram` — grammY webhook; `lib/telegram` — bot, Mini App auth
- `lib/sources`, `lib/scrapers` — one adapter per source; `lib/jobs` — ingest, dedupe, pre-filter, add-by-link, source health
- `lib/search` — scoring pipeline, rubric, requirements, calibration, re-score
- `lib/ai` — Gemini client, limiter, budgets, quotas, prompt metadata, fact guard
- `lib/apply` — letters, form drafts; `lib/replies` — employer replies; `lib/tracker` — linking, funnel, follow-ups, skip reasons
- `lib/agent` — agent API, agent jobs, MCP tools, drafts
- `prisma/schema.prisma` — tables; `supabase/` — SQL schema and migrations
