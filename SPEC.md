# Jobber — SPEC

Working rules for agents are in `AGENTS.md`. "no test" marks an invariant with no automated test yet.

## §G Goal

Find the jobs worth applying to, help apply, and track every application to a reply, for one owner and invited users,
inside Telegram and the browser (`README.md`). Free code rules do most of the filtering; Gemini scores only the best few.
The user decides and sends everything themselves.

## §C Constraints

- Stack: Next.js 16 App Router with `cacheComponents` (`next.config.ts`), React 19, TypeScript, Prisma 5 on Supabase Postgres, grammY, zod, vitest (`package.json`).
- Hosting: Vercel, region `dub1`, functions up to 60 s. Vercel Cron is the only scheduler (`vercel.json`). There are no queues or workers;
  state lives in Postgres, with `CronJob` rows used as a key-value store (`prisma/schema.prisma`).
- AI: Gemini over REST (`lib/ai/gemini.ts`). Flash-lite is the default. Flash is only for `verify`, or for `smart` when `GEMINI_FLASH_FALLBACK=true`.
  The shared key has a daily budget (`lib/ai/budget.ts`) and per-user quotas (`dailyLimits`, `lib/ai/limiter.ts`). A user's own key gets higher quotas.
- Users: invite-only, except the owner (`signInWithTelegram`, `lib/data/service.ts`). The agent API, MCP, morning drafts and scrapers act only for the owner.
- Privacy: the browser never reads the DB, and RLS is on for every table (`supabase/migrations/*`). Stored keys are AES-256-GCM encrypted
  (`lib/crypto/encryption.ts`). `seed-data/` is gitignored. Scraped text is scrubbed of contact details (`scrubPersonal`).
- Never sends anything to employers. Letters, form drafts, follow-ups and reply drafts are drafts only (`lib/apply/drafts.ts`, `lib/replies/handle.ts`).
- Schema changes are SQL files in `supabase/migrations/`, run by hand before the deploy that needs them (`README.md`).

## §I Interfaces

**Agent API** (`lib/agent/api.ts`). Send `Authorization: Bearer <key>`. Keys must be at least 24 characters.
`AGENT_API_KEY` has full access. `AGENT_API_KEY_CLAUDE` is GET/HEAD only unless `AGENT_API_KEY_CLAUDE_WRITE=true`, and otherwise gets 403 `read_only`.
Errors: no key configured → 503, bad key → 401, no `OWNER_TELEGRAM_ID` user → 404.
- `POST /api/agent/jobs`: one job or `{items ≤25, source}`. Each item needs `url`, `text`, or title + company + description.
  Each returns `created|duplicate` with `jobId`, `matchId`, `tracked`, or `{error, retry}`. Then one scoring request runs unless `score:false`.
- `GET /api/agent/jobs?jobIds=a,b` (up to 100): `state` is `queued|skipped|scored`, with score, reasons, flags and link.
- `GET /api/agent/applications`: filters `status, q, company, role, url, updatedSince, limit`.
  `POST` upserts one row or `{items ≤200}`, deduping on the normalized URL, then company + role.
- `GET|PATCH /api/agent/applications/{id}`: PATCH accepts `status, appliedAt, followUpAt, notes, appendNote, nextAction, skipReason`.
- `GET|POST /api/agent/applications/{id}/prepare`: GET returns saved form drafts. POST generates drafts and never submits (`lib/apply/prepare.ts`).

**MCP.** Remote, stateless Streamable HTTP (`lib/agent/mcp.ts`): `POST /api/mcp/{token}`, where the token is `MCP_URL_TOKEN` or the Claude key,
or `POST /api/mcp` with Bearer Claude key. OPTIONS → 204 with CORS. GET/HEAD/DELETE → 405. Bad auth → 404. `AGENT_API_KEY` is not accepted.
- Read tools: `list_applications`, `get_application`, `get_profile`, `list_matches`, `get_match`.
- Write tools, only with the write flag: `upsert_application`, `update_status`, and `save_cover_letter` (returns fact-guard flags).
- Stdio server `mcp/src/index.ts` (`JOBBER_API_URL`, `JOBBER_API_KEY`) has `list_applications`, `get_application`, `upsert_application`
  and `update_status`, which call the agent API.

**Crons** (`vercel.json`, UTC). Each needs `Authorization: Bearer $CRON_SECRET`.
- 08:00 and 14:00 `/api/cron/fetch-jobs`: fetches sources not fetched in 20 h, 6 at a time, within a 50 s budget.
  `?all=1`, `?only=<type>` and `?recheck=1` override this. Also runs a weekly careers-page recheck, the daily digest, and a source health report on Mondays.
- 09:00 and 15:00 `/api/cron/match-jobs`: up to 20 users, 6 scoring requests each, then the Flash check (`verifyTop`).
- 09:40 `/api/cron/agent-drafts`: letters for the best new matches, plus a Telegram note (`lib/agent/drafts.ts`).
- 10:00 `/api/cron/follow-ups`: Telegram reminders for due applications.
- `/api/cron/perf` is not scheduled. It is a timing probe that returns numbers only.

**Telegram.**
- `POST /api/telegram` is the grammY webhook (`lib/telegram/bot.ts`). Commands: `/start` (invite, `login_`, `link_`), `/help`, `/matches`, `/profile`, `/reminders`.
  Text of 80+ characters is read as an employer reply. Buttons: `A:` (Sent, moves to applied), `U:` (Undo), `L:` (approve web login).
- `POST /api/auth/telegram {initData, invite?}` checks initData (`lib/telegram/init-data.ts`), then signs in or returns 403 `invite`.
- `/api/auth/telegram-bot` with `/auth/telegram-link` signs a browser in through the bot (`lib/auth/bot-login.ts`).
- Session cookie `jobber_session`: HMAC-signed with `ENCRYPTION_KEY`, valid 30 days, httpOnly (`lib/auth/session.ts`).

## §V Invariants

- V1. Dedupe key is company | title | first place word, ignoring case, accents, legal suffixes and gender markers. Tested in `lib/jobs/dedupe.test.ts`.
- V2. URL key drops www, tracking parameters and hash. It is null for generic careers pages, search URLs, HN and manual jobs. `dedupe.test.ts`.
- V3. Ingest stores a posting once across all sources, by `dedupeKey` or `urlKey` (`lib/jobs/ingest.ts`). No test.
- V4. Jobs are never deleted. Missing jobs close (`isActive=false`) only for `FULL_LIST_TYPES` when 0 < seen < max. `lib/search/quality.test.ts` (`closesMissing`).
- V5. A match is hidden only by a tracker row with status applied, interview, on_hold, offer or rejected that has the same URL or company + role,
  or when its job is inactive (`notTracked`, `dropTracked` in `lib/tracker/link.ts`). No test.
- V6. The pre-filter drops, before any AI call: excluded companies, avoid words, old ads, internships and part-time, non-engineering titles,
  titles that miss the target roles, seniority more than one level off, German-required ads for non-German users, region-locked remote,
  and location tiers the user does not accept. `lib/jobs/prefilter.test.ts`, `lib/search/rubric.test.ts`.
- V7. Only jobs with `preScore` ≥ `AI_PRESCORE_MIN` (40) go to AI, except agent picks. At most `AI_TOP_CANDIDATES` (24) per run, 12 per request (`lib/search/score.ts`). No test.
- V8. Score weights are role .30, skills .30, seniority .15, location .10, language .07, salary .08.
  Role < 40 caps the total at role + 12. Skills < 30 caps it at skills + 20. `rubric.test.ts`.
- V9. Code decides requirement coverage; the model cannot add a skill the CV lacks. `lib/search/requirements.test.ts`.
- V10. A truncated AI reply keeps its complete results; the other jobs stay queued. `quality.test.ts` (`salvageResults`).
- V11. Shared budget per Pacific day, defaults: lite 480 for onboarding and 400 for everything else; Flash 18. `rubric.test.ts` ("keeps a reserve").
- V12. Per-user quotas are counted per UTC day. The fallback is 20 score requests, or 240 with the user's own key. `lib/ai/limiter.test.ts`.
  The owner has no per-user quota (`isUnlimited`, no test).
- V13. Tier `verify` uses Flash only. Other tiers use lite unless the fallback flag is set. `quality.test.ts`.
- V14. Only changes to scored profile fields trigger a re-score, and the order of list entries doesn't matter. `quality.test.ts` (`scoringChanged`).
- V15. Calibration uses at most 3 interview, 4 applied and 5 skipped decisions, skips with a reason first, and is empty with fewer than 2 decisions.
  `quality.test.ts`, `lib/search/digest.test.ts`.
- V16. The fact guard flags names, acronyms, numbers, links and credentials that no source backs. It stays quiet on backed facts and never
  rewrites. `lib/ai/fact-guard.test.ts`. Form drafts check text answers only. `lib/apply/apply.test.ts`.
- V17. A replaced letter is kept as a version, up to 12. Outputs from an older prompt version are stale. `lib/apply/letter.test.ts`.
- V18. Agent jobs need a link, text or a full ad; a description under 150 characters counts as incomplete. `lib/agent/jobs.test.ts`.
  At most 25 items per call, and agent picks never create tracker rows (`app/api/agent/jobs/route.ts`, `lib/agent/jobs.ts`). No test.
- V19. The Claude key cannot write unless the write flag is set, through the API (403) or MCP (error, no change). Keys under 24 characters are ignored (`lib/agent/api.ts`, `lib/agent/mcp.ts`). No test.
- V20. safe-fetch allows only http(s), ports 80/443/8080/8443, no credentials in the URL, and only public IPs. It re-checks every redirect
  (4 at most) and caps the body size. `lib/net/safe-fetch.test.ts`.
- V21. Telegram initData must carry a valid HMAC, be at most 24 h old and at most 5 min in the future. `lib/telegram/init-data.test.ts`.
- V22. Bot login tokens are signed, single-use and expire after 5 min. `lib/auth/bot-login.test.ts`.
- V23. Encryption is AES-256-GCM with a fresh IV each time; tampered data fails to decrypt. `lib/crypto/encryption.test.ts`.
- V24. The digest goes out once per UTC day, only from the scheduled fetch, only to users with `alertFrequency` "daily". It includes untracked matches
  from the last 24 h with score ≥ `alertThreshold` (default 70), at most 10 (`app/api/cron/fetch-jobs/route.ts`, `lib/telegram/bot.ts`). No test.
- V25. Moving to applied without dates sets `appliedAt` to now and `followUpAt` to +7 days (`followUpDates`). Each due `applied` row
  gets one reminder; `followUpSent` blocks repeats (`app/api/cron/follow-ups/route.ts`). No test.
- V26. The Review deck shows undecided cards, and "later" cards only once their time comes (3 days). `lib/tracker/deck.test.ts`.
  Score ≥ max(50, `minScore`), at most 15 cards, and Undo deletes only an untouched row it created (`lib/tracker/deck.ts`, `lib/tracker/decide.ts`). No test.
- V27. For employer replies, code decides any status change. An application id is trusted only if the company matches. `lib/replies/classify.test.ts`.
- V28. Scrapers run only with `OWNER_SCRAPERS` plus the allowlist (or `SCRAPER_ALLOW_ALL`), and scraped text is scrubbed. `lib/scrapers/scrapers.test.ts`.
- V29. The onboarding search plan keeps only companies from the verified seed list. `lib/ai/cv-profile.test.ts`.

## §T Tasks

| id | status | goal | cites |
|---|---|---|---|
| T1 | x | MVP: job matching, tracking, Telegram digests | bb7d0c3 |
| T2 | x | Telegram Mini App sign-in, SDK only inside Telegram | 92c9eac, f3bda4f, 572e250 |
| T3 | x | Supabase poolers, Telegram owner, one account for Telegram and web | 56603f3, 5b02fef |
| T4 | x | Sign in on the web through the bot | 8bb27ab |
| T5 | x | Shared Gemini with quotas, CV-first onboarding, verified seed list, rule pre-filter | ba02134 |
| T6 | x | Flash-lite + shared budget, own key, guided form, multiple CVs | 717281f |
| T7 | x | Owner-only Austrian scrapers, add job by link | 77549f7, 21f40d4, 3818c23 |
| T8 | x | Faster pipeline: per-host parallel fetch, pre-score ranking, batches of 12 | 2efc11b |
| T9 | x | Agent API for applications, sheet import | a115184, dd6ddc9 |
| T10 | x | Tracker v2, follow-ups, hide tracked jobs from Matches | 8b4bbf1, f0b1baf, db28a35, 49b5301, 156d762, 26bf449 |
| T11 | x | Owner unlimited, shared key pool | a637679 |
| T12 | x | Read-only Claude key, stdio MCP, remote MCP | 5d86c06, 2900743, b3f4feb |
| T13 | x | Fetch every due source per run, second daily slot, weekly recheck | e2d4ca6, e29d4b0 |
| T14 | x | Prepare application from real ATS form questions | 0b74cf8, 194b8b5 |
| T15 | x | Perf: `dub1`, lighter queries, perf probe | de9d378, 2abff6a |
| T16 | x | Facts, fact guard, requirement matching, letter versions, replies, HN source | 2191cda |
| T17 | x | Sharper scoring, agent drafts, funnel, SSRF-safe fetch, interview calendar | 127b6e1 |
| T18 | x | JSearch source with the user's own key | fee2457 |
| T19 | x | Past interviews in the funnel, quiet days | 2fa3b4b |
| T20 | x | Agent jobs go to the job pool, not the tracker | e82d564 |
| T21 | x | Closed jobs, re-scoring, Flash check, skip reasons, source health | f41b12e |
| T22 | x | Review deck | f03fc55, 672a37a |
| T23 | x | UX and visual pass across all screens | ec587bd … d931b7d |
| T24 | > | `AGENTS.md` and `SPEC.md` for coding agents | branch `docs/agents-spec` |
| T25 |  | End the temporary `SCRAPER_ALLOW_ALL` and go back to the allowlist | `lib/scrapers/index.ts`, 43f03ea |

## §B Bug log

| id | date | cause | fix | invariant |
|---|---|---|---|---|
| B1 | 2026-10-11 | `@types/node` ^20 clashed with vitest's peer deps, so `npm install` failed without `--legacy-peer-deps` | bumped to ^22 (bb53ab0) | — |
| B2 | 2026-10-11 | the webhook route read the body before grammY, so every Telegram update failed | pass the request straight to grammY (5de647a) | — (pitfall in `AGENTS.md`) |
| B3 | 2026-10-11 | not stated; a bundle of fixes | dropped OpenRouter, explicit email-sent state, removed Telegram MainButton, instant tab navigation, PWA, theme (905e3ef) | — |
| B4 | 2026-10-12 | `pdf-parse` needs a pdf.js worker and canvas that Vercel didn't bundle, so CV upload failed | `unpdf` in `lib/pdf.ts`, clearer errors (aca2643) | — |
