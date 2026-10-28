import crypto from 'crypto';
import { parseStoredRequirements } from '@/lib/search/requirements';
import { parseAiMeta, withNewLetter, type AiMeta, type OutputMeta } from '@/lib/ai/meta';
import { cache } from 'react';
import { isDemoMode } from '@/lib/demo/mode';
import { linkApplications, notTracked } from '@/lib/tracker/link';
import { demoStore, type AppFit, type DemoApplication, type DemoProfile } from '@/lib/demo/store';
import { getPrisma } from '@/lib/db/prisma';
import { readSessionUserId } from '@/lib/auth/session';
import type { CvAdvice } from '@/lib/ai/cv-advice';

export interface SessionUser {
  id: string;
  email: string;
  telegramId: string | null;
  telegramUsername: string | null;
}

function followUpDates(status: string, appliedAt?: string | null, followUpAt?: string | null) {
  let applied = appliedAt ? new Date(appliedAt) : null;
  let followUp = followUpAt ? new Date(followUpAt) : null;
  if (status === 'applied' && !applied) applied = new Date();
  if (status === 'applied' && applied && !followUp) {
    followUp = new Date(applied.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return { appliedAt: applied, followUpAt: followUp };
}

/** Deduped per request: layout and page share one lookup. */
export const requireUser = cache(loadUser);

async function loadUser(): Promise<SessionUser | null> {
  if (isDemoMode()) return demoStore.user();

  const sessionUserId = await readSessionUserId();
  if (sessionUserId) {
    const prisma = getPrisma();
    const sessionUser = await prisma.user.findUnique({ where: { id: sessionUserId } });
    if (sessionUser) return sessionUser;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;

  const { createClient } = await import('@/lib/db/supabase-server');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({
    where: { OR: [{ supabaseId: user.id }, { email: user.email }] },
  });

  if (existing) {
    if (existing.supabaseId !== user.id) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { supabaseId: user.id },
      });
    }
    return existing;
  }

  return prisma.user.create({
    data: { email: user.email, supabaseId: user.id },
  });
}

export async function getProfile(userId: string): Promise<DemoProfile> {
  if (isDemoMode()) return demoStore.profile();

  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) {
    return {
      cvText: null,
      cvFileName: null,
      skills: [],
      location: null,
      remoteOnly: false,
      countryEligible: null,
      languages: [],
      salaryMin: null,
      salaryMax: null,
      stackKeywords: [],
      skillGaps: [],
      writingRules: null,
      facts: null,
      watchedCompanies: [],
      fullName: null,
      targetRoles: [],
      seniority: null,
      yearsExperience: null,
      searchKeywords: [],
      sourceIds: [],
      onboardedAt: null,
    };
  }

  const { id: _id, userId: _uid, createdAt: _c, updatedAt: _u, ...rest } = profile;
  return { ...rest, onboardedAt: profile.onboardedAt?.toISOString() ?? null };
}

export async function saveProfile(userId: string, patch: Partial<DemoProfile>) {
  if (isDemoMode()) return demoStore.saveProfile(patch);

  const current = await getProfile(userId);
  const merged = { ...current, ...patch };
  const next = { ...merged, onboardedAt: merged.onboardedAt ? new Date(merged.onboardedAt) : null };
  const prisma = getPrisma();
  await prisma.profile.upsert({
    where: { userId },
    create: { userId, ...next },
    update: next,
  });
  return next;
}

/** linkApplications scans every match; on page views run it at most every few minutes per user (explicit calls still link at once). */
const g = globalThis as unknown as { linkedAt?: Map<string, number> };
g.linkedAt ??= new Map();
async function linkThrottled(userId: string) {
  const last = g.linkedAt!.get(userId) || 0;
  if (Date.now() - last < 5 * 60_000) return;
  g.linkedAt!.set(userId, Date.now());
  await linkApplications(userId).catch(() => []);
}

const matchJobSelect = {
  id: true, title: true, company: true, location: true, remote: true, url: true,
  salaryMin: true, salaryMax: true, currency: true, postedAt: true,
  source: { select: { company: true, sector: true } },
} as const;

type MatchRowDb = Awaited<ReturnType<typeof loadMatchRows>>[number];
function loadMatchRows(userId: string, where: object, take: number, withDescription: boolean) {
  return getPrisma().jobMatch.findMany({
    where: { userId, ...where },
    select: {
      id: true, score: true, priority: true, reasons: true, redFlags: true, coverLetter: true, aiMeta: true, cvAdvice: true, tailoredCv: true,
      cvId: true, locationTier: true, subScores: true, requirements: true, createdAt: true,
      job: { select: { ...matchJobSelect, description: withDescription } },
    },
    orderBy: { score: 'desc' },
    take,
  });
}

async function shapeMatches(userId: string, matches: MatchRowDb[]) {
  const cvIds = [...new Set(matches.map((m) => m.cvId).filter((v): v is string => Boolean(v)))];
  const cvs = cvIds.length ? await getPrisma().cv.findMany({ where: { id: { in: cvIds }, userId }, select: { id: true, label: true } }) : [];
  const cvLabel = new Map(cvs.map((c) => [c.id, c.label]));
  return matches.map((match) => ({
    cvLabel: match.cvId ? cvLabel.get(match.cvId) ?? null : null,
    id: match.id,
    score: match.score,
    priority: match.priority as 'high' | 'medium' | 'low',
    reasons: match.reasons,
    redFlags: match.redFlags,
    coverLetter: match.coverLetter,
    aiMeta: parseAiMeta(match.aiMeta),
    cvAdvice: (match.cvAdvice as CvAdvice | null) ?? null,
    tailoredCv: match.tailoredCv,
    cvId: match.cvId,
    locationTier: match.locationTier,
    subScores: (match.subScores as Record<string, number> | null) ?? null,
    requirements: parseStoredRequirements(match.requirements),
    job: {
      id: match.job.id,
      title: match.job.title,
      company: match.job.company || match.job.source.company,
      sector: match.job.source.sector,
      location: match.job.location,
      remote: match.job.remote,
      url: match.job.url,
      // List views skip the (up to 20 KB) description; getMatch loads it for the detail.
      description: (match.job as { description?: string }).description ?? '',
      salaryMin: match.job.salaryMin,
      salaryMax: match.job.salaryMax,
      currency: match.job.currency,
      postedAt: match.job.postedAt?.toISOString() ?? null,
    },
    createdAt: match.createdAt.toISOString(),
  }));
}

export async function getMatches(userId: string, opts: { withDescription?: boolean } = {}) {
  if (isDemoMode()) return demoStore.matches();
  await linkThrottled(userId);
  return shapeMatches(userId, await loadMatchRows(userId, { filtered: false, ...notTracked(userId) }, 120, Boolean(opts.withDescription)));
}

export async function getSkipped(userId: string) {
  if (isDemoMode()) return [];
  const rows = await getPrisma().jobMatch.findMany({
    where: { userId, filtered: true },
    include: { job: { include: { source: true } } },
    orderBy: { createdAt: 'desc' },
    take: 150,
  });
  return rows.map((m) => ({
    id: m.id,
    reason: m.redFlags[0] || 'Filtered',
    tier: m.locationTier,
    job: { title: m.job.title, company: m.job.company || m.job.source.company, location: m.job.location, remote: m.job.remote, url: m.job.url },
  }));
}

export async function skippedReasons(userId: string) {
  if (isDemoMode()) return [];
  const rows = await getPrisma().$queryRaw<Array<{ reason: string | null; n: bigint }>>`
    select "redFlags"[1] as reason, count(*) as n from "JobMatch" where "userId" = ${userId} and filtered group by 1 order by 2 desc limit 12`;
  return rows.map((r) => ({ reason: r.reason || 'Filtered', count: Number(r.n) }));
}

export async function countSkipped(userId: string) {
  if (isDemoMode()) return 0;
  return getPrisma().jobMatch.count({ where: { userId, filtered: true } });
}

/** One match with its full description (no list scan). */
export async function getMatch(userId: string, matchId: string) {
  if (isDemoMode()) return demoStore.matches().find((m) => m.id === matchId) || null;
  const rows = await loadMatchRows(userId, { id: matchId }, 1, true);
  return rows.length ? (await shapeMatches(userId, rows))[0] : null;
}

/** Saves a new letter; the one it replaces goes into the version history. */
export async function saveCoverLetter(userId: string, matchId: string, letter: string, meta: OutputMeta) {
  if (isDemoMode()) return demoStore.saveCoverLetter(matchId, letter, meta);

  const prisma = getPrisma();
  const match = await prisma.jobMatch.findFirst({ where: { id: matchId, userId } });
  if (!match) return null;
  return prisma.jobMatch.update({
    where: { id: matchId },
    data: { coverLetter: letter, aiMeta: withNewLetter(parseAiMeta(match.aiMeta), match.coverLetter, meta) as object },
  });
}

export async function getApplications(userId: string): Promise<DemoApplication[]> {
  if (isDemoMode()) return demoStore.applications();

  const prisma = getPrisma();
  const apps = await prisma.application.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { job: { select: { matches: { where: { userId, filtered: false }, select: { score: true, reasons: true, redFlags: true, subScores: true, cvAdvice: true, cvId: true, updatedAt: true } } } } },
  });
  const cvRows = await prisma.cv.findMany({ where: { userId }, select: { id: true, label: true } });
  const cvLabel = new Map(cvRows.map((c) => [c.id, c.label]));

  return apps.map((app) => ({
    id: app.id,
    company: app.company,
    role: app.role,
    url: app.url,
    status: app.status,
    appliedAt: app.appliedAt?.toISOString() ?? null,
    followUpAt: app.followUpAt?.toISOString() ?? null,
    followUpSent: app.followUpSent,
    contact: app.contact,
    salaryExpectation: app.salaryExpectation,
    notes: app.notes,
    coverLetter: app.coverLetter,
    location: app.location,
    source: app.source,
    priority: app.priority,
    score: app.score,
    whyFit: app.whyFit,
    risks: app.risks,
    nextAction: app.nextAction,
    updatedAt: app.updatedAt.toISOString(),
    jobId: app.jobId,
    fit: (() => {
      const m = app.job?.matches[0];
      if (!m || m.score <= 0) return null;
      return {
        score: m.score, reasons: m.reasons, redFlags: m.redFlags,
        subScores: (m.subScores as Record<string, number> | null) ?? null,
        cvAdvice: (m.cvAdvice as AppFit['cvAdvice']) ?? null,
        cvLabel: m.cvId ? cvLabel.get(m.cvId) ?? null : null, scoredAt: m.updatedAt.toISOString(),
      };
    })(),
  }));
}

export async function createApplication(
  userId: string,
  input: {
    company: string;
    role: string;
    url?: string | null;
    status?: string;
    appliedAt?: string | null;
    followUpAt?: string | null;
    contact?: string | null;
    salaryExpectation?: string | null;
    notes?: string | null;
  },
) {
  const status = input.status || 'to_apply';
  const dates = followUpDates(status, input.appliedAt, input.followUpAt);
  const record = {
    company: input.company,
    role: input.role,
    url: input.url || null,
    status,
    appliedAt: dates.appliedAt?.toISOString() ?? null,
    followUpAt: dates.followUpAt?.toISOString() ?? null,
    followUpSent: false,
    contact: input.contact || null,
    salaryExpectation: input.salaryExpectation || null,
    notes: input.notes || null,
    coverLetter: null,
  };

  if (isDemoMode()) return demoStore.addApplication(record);

  const prisma = getPrisma();
  const created = await prisma.application.create({
    data: {
      userId,
      company: record.company,
      role: record.role,
      url: record.url,
      status: record.status,
      appliedAt: dates.appliedAt,
      followUpAt: dates.followUpAt,
      contact: record.contact,
      salaryExpectation: record.salaryExpectation,
      notes: record.notes,
    },
  });
  await linkApplications(userId, { applicationIds: [created.id] }).catch(() => []);
  return created;
}

export async function updateApplication(
  userId: string,
  id: string,
  patch: Partial<DemoApplication>,
) {
  if (isDemoMode()) {
    const current = demoStore.applications().find((item) => item.id === id);
    if (!current) return null;
    const status = patch.status || current.status;
    const dates = followUpDates(
      status,
      patch.appliedAt === undefined ? current.appliedAt : patch.appliedAt,
      patch.followUpAt === undefined ? current.followUpAt : patch.followUpAt,
    );
    return demoStore.updateApplication(id, {
      ...patch,
      updatedAt: new Date().toISOString(),
      status,
      appliedAt: dates.appliedAt?.toISOString() ?? null,
      followUpAt: dates.followUpAt?.toISOString() ?? null,
    });
  }

  const prisma = getPrisma();
  const current = await prisma.application.findFirst({ where: { id, userId } });
  if (!current) return null;
  const status = patch.status || current.status;
  const dates = followUpDates(
    status,
    patch.appliedAt === undefined ? current.appliedAt?.toISOString() : patch.appliedAt,
    patch.followUpAt === undefined ? current.followUpAt?.toISOString() : patch.followUpAt,
  );

  return prisma.application.update({
    where: { id },
    data: {
      status,
      company: patch.company,
      role: patch.role,
      url: patch.url,
      notes: patch.notes,
      contact: patch.contact,
      salaryExpectation: patch.salaryExpectation,
      appliedAt: dates.appliedAt,
      followUpAt: dates.followUpAt,
      followUpSent: patch.followUpAt !== undefined ? false : patch.followUpSent,
      nextAction: patch.nextAction,
      priority: patch.priority,
    },
  });
}

export async function signInWithTelegram(input: {
  telegramId: string;
  username?: string;
  startParam?: string;
}): Promise<{ user: SessionUser } | { error: 'invite' }> {
  if (isDemoMode()) {
    demoStore.linkTelegram(input.telegramId, input.username);
    return { user: demoStore.user() };
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { telegramId: input.telegramId } });
  if (existing) {
    if (input.username && input.username !== existing.telegramUsername) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { telegramUsername: input.username },
      });
      return { user: updated };
    }
    return { user: existing };
  }

  const configuredOwner = process.env.OWNER_TELEGRAM_ID?.trim();
  if (configuredOwner && input.telegramId === configuredOwner) {
    const created = await prisma.user.create({
      data: {
        email: `tg${input.telegramId}@users.jobber.local`,
        telegramId: input.telegramId,
        telegramUsername: input.username || null,
      },
    });
    return { user: created };
  }

  const invite = input.startParam?.trim() || '';
  const allowed = invite ? await checkInvite(invite) : false;
  if (!allowed) return { error: 'invite' };

  const created = await prisma.user.create({
    data: {
      email: `tg${input.telegramId}@users.jobber.local`,
      telegramId: input.telegramId,
      telegramUsername: input.username || null,
      invitedBy: invite,
    },
  });
  if (allowed) await consumeInvite(invite, created.id);
  return { user: created };
}

export async function isOwner(user: SessionUser) {
  const configured = process.env.OWNER_TELEGRAM_ID?.trim();
  if (configured) return user.telegramId === configured;

  const prisma = getPrisma();
  const first = await prisma.user.findFirst({
    where: { telegramId: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  return first?.id === user.id;
}

export async function createInvite(user: SessionUser) {
  if (isDemoMode()) return demoStore.createInvite();

  const prisma = getPrisma();
  if (!(await isOwner(user))) {
    throw new Error('Only the owner can create invite codes');
  }
  const code = `jobber-${crypto.randomBytes(3).toString('hex')}`;
  await prisma.inviteCode.create({
    data: {
      code,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });
  return code;
}

export async function checkInvite(code: string) {
  const trimmed = code.trim();
  if (isDemoMode()) return trimmed.length >= 4;
  const prisma = getPrisma();
  const invite = await prisma.inviteCode.findUnique({ where: { code: trimmed } });
  if (!invite || invite.usedBy) return false;
  if (invite.expiresAt && invite.expiresAt < new Date()) return false;
  return true;
}

export async function consumeInvite(code: string, userId: string) {
  if (isDemoMode()) return;
  const prisma = getPrisma();
  await prisma.inviteCode.updateMany({
    where: { code, usedBy: null },
    data: { usedBy: userId, usedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { invitedBy: code },
  });
}

// ---------------------------------------------------------------------------
// Linked accounts: one User row carries both telegramId and a real email.
// ---------------------------------------------------------------------------

const PLACEHOLDER_EMAIL = /@users\.jobber\.local$/;

export function hasRealEmail(user: { email: string }) {
  return !PLACEHOLDER_EMAIL.test(user.email);
}

export interface LinkedAccounts {
  telegram: { id: string; username: string | null } | null;
  email: string | null;
}

export function linkedAccounts(user: SessionUser): LinkedAccounts {
  return {
    telegram: user.telegramId ? { id: user.telegramId, username: user.telegramUsername } : null,
    email: hasRealEmail(user) ? user.email : null,
  };
}

type LinkResult = { ok: true } | { ok: false; error: string };

/** Attach a Telegram identity to an existing (usually email) account. */
export async function linkTelegramToUser(userId: string, telegramId: string, username?: string): Promise<LinkResult> {
  if (isDemoMode()) {
    demoStore.linkTelegram(telegramId, username);
    return { ok: true };
  }
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: 'Account not found' };
  if (user.telegramId === telegramId) return { ok: true };
  if (user.telegramId) return { ok: false, error: 'A different Telegram account is already linked. Unlink it first.' };

  const other = await prisma.user.findUnique({ where: { telegramId } });
  if (other && other.id !== userId) {
    // A Telegram-only account with nothing in it can be folded into this one.
    const [matches, apps, keys, profile] = await Promise.all([
      prisma.jobMatch.count({ where: { userId: other.id } }),
      prisma.application.count({ where: { userId: other.id } }),
      prisma.apiKey.count({ where: { userId: other.id } }),
      prisma.profile.findUnique({ where: { userId: other.id } }),
    ]);
    const empty = !hasRealEmail(other) && matches + apps + keys === 0 && !profile?.cvText;
    if (!empty) {
      return { ok: false, error: 'This Telegram account already has its own Jobber data. Sign in with Telegram and link the email from there.' };
    }
    await prisma.user.delete({ where: { id: other.id } });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { telegramId, telegramUsername: username || null },
  });
  return { ok: true };
}

/** Attach a verified email (from a Supabase magic link) to the signed-in account. */
export async function linkEmailToUser(userId: string, email: string, supabaseId: string): Promise<LinkResult> {
  if (isDemoMode()) return { ok: true };
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: 'Account not found' };
  if (user.email === email) {
    if (user.supabaseId !== supabaseId) await prisma.user.update({ where: { id: userId }, data: { supabaseId } });
    return { ok: true };
  }
  const other = await prisma.user.findFirst({ where: { OR: [{ email }, { supabaseId }] } });
  if (other && other.id !== userId) {
    const [matches, apps, keys] = await Promise.all([
      prisma.jobMatch.count({ where: { userId: other.id } }),
      prisma.application.count({ where: { userId: other.id } }),
      prisma.apiKey.count({ where: { userId: other.id } }),
    ]);
    if (other.telegramId || matches + apps + keys > 0) {
      return { ok: false, error: 'This email already belongs to another Jobber account.' };
    }
    await prisma.user.delete({ where: { id: other.id } });
  }
  await prisma.user.update({ where: { id: userId }, data: { email, supabaseId } });
  return { ok: true };
}

export async function unlinkAccount(userId: string, kind: 'telegram' | 'email'): Promise<LinkResult> {
  if (isDemoMode()) return { ok: false, error: 'Not available in demo mode' };
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: 'Account not found' };
  if (kind === 'telegram') {
    if (!user.telegramId) return { ok: true };
    if (!hasRealEmail(user)) return { ok: false, error: 'Link an email first, or you would lose access.' };
    if (process.env.OWNER_TELEGRAM_ID?.trim() === user.telegramId) {
      return { ok: false, error: 'The owner Telegram account cannot be unlinked.' };
    }
    await prisma.user.update({ where: { id: userId }, data: { telegramId: null, telegramUsername: null } });
    return { ok: true };
  }
  if (!hasRealEmail(user)) return { ok: true };
  if (!user.telegramId) return { ok: false, error: 'Link Telegram first, or you would lose access.' };
  await prisma.user.update({
    where: { id: userId },
    data: { email: `tg${user.telegramId}@users.jobber.local`, supabaseId: null },
  });
  return { ok: true };
}

export async function saveMatchExtras(
  userId: string,
  matchId: string,
  data: { cvAdvice?: CvAdvice; tailoredCv?: string },
  meta: Partial<Pick<AiMeta, 'advice' | 'tailoredCv'>> = {},
) {
  if (isDemoMode()) return null;
  const prisma = getPrisma();
  const match = await prisma.jobMatch.findFirst({ where: { id: matchId, userId } });
  if (!match) return null;
  return prisma.jobMatch.update({
    where: { id: matchId },
    data: {
      ...(data.cvAdvice ? { cvAdvice: data.cvAdvice } : {}),
      ...(data.tailoredCv ? { tailoredCv: data.tailoredCv } : {}),
      aiMeta: { ...parseAiMeta(match.aiMeta), ...meta } as object,
    },
  });
}
