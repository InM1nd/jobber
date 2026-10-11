import crypto from 'crypto';
import { isDemoMode } from '@/lib/demo/mode';
import { demoStore, type DemoApplication, type DemoProfile } from '@/lib/demo/store';
import { decryptApiKey, encryptApiKey } from '@/lib/crypto/encryption';
import { getPrisma } from '@/lib/db/prisma';
import { readSessionUserId } from '@/lib/auth/session';

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

export async function requireUser(): Promise<SessionUser | null> {
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
      watchedCompanies: [],
    };
  }

  return {
    cvText: profile.cvText,
    cvFileName: profile.cvFileName,
    skills: profile.skills,
    location: profile.location,
    remoteOnly: profile.remoteOnly,
    countryEligible: profile.countryEligible,
    languages: profile.languages,
    salaryMin: profile.salaryMin,
    salaryMax: profile.salaryMax,
    stackKeywords: profile.stackKeywords,
    skillGaps: profile.skillGaps,
    writingRules: profile.writingRules,
    watchedCompanies: profile.watchedCompanies,
  };
}

export async function saveProfile(userId: string, patch: Partial<DemoProfile>) {
  if (isDemoMode()) return demoStore.saveProfile(patch);

  const current = await getProfile(userId);
  const next = { ...current, ...patch };
  const prisma = getPrisma();
  await prisma.profile.upsert({
    where: { userId },
    create: { userId, ...next },
    update: next,
  });
  return next;
}

export async function getMatches(userId: string) {
  if (isDemoMode()) return demoStore.matches();

  const prisma = getPrisma();
  const matches = await prisma.jobMatch.findMany({
    where: { userId },
    include: { job: { include: { source: true } } },
    orderBy: { score: 'desc' },
    take: 80,
  });

  return matches.map((match) => ({
    id: match.id,
    score: match.score,
    priority: match.priority as 'high' | 'medium' | 'low',
    reasons: match.reasons,
    redFlags: match.redFlags,
    coverLetter: match.coverLetter,
    job: {
      id: match.job.id,
      title: match.job.title,
      company: match.job.source.company,
      sector: match.job.source.sector,
      location: match.job.location,
      remote: match.job.remote,
      url: match.job.url,
      description: match.job.description,
      salaryMin: match.job.salaryMin,
      salaryMax: match.job.salaryMax,
      currency: match.job.currency,
      postedAt: match.job.postedAt?.toISOString() ?? null,
    },
  }));
}

export async function getMatch(userId: string, matchId: string) {
  const matches = await getMatches(userId);
  return matches.find((match) => match.id === matchId) || null;
}

export async function saveCoverLetter(userId: string, matchId: string, letter: string) {
  if (isDemoMode()) return demoStore.saveCoverLetter(matchId, letter);

  const prisma = getPrisma();
  const match = await prisma.jobMatch.findFirst({ where: { id: matchId, userId } });
  if (!match) return null;
  return prisma.jobMatch.update({
    where: { id: matchId },
    data: { coverLetter: letter },
  });
}

export async function getApplications(userId: string): Promise<DemoApplication[]> {
  if (isDemoMode()) return demoStore.applications();

  const prisma = getPrisma();
  const apps = await prisma.application.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

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
  return prisma.application.create({
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
      followUpSent: patch.followUpSent,
    },
  });
}

export async function listApiKeys(userId: string) {
  if (isDemoMode()) return demoStore.keys();
  const prisma = getPrisma();
  const keys = await prisma.apiKey.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return keys.map((key) => ({
    id: key.id,
    provider: key.provider,
    createdAt: key.createdAt.toISOString(),
  }));
}

export async function saveApiKey(userId: string, provider: string, apiKey: string) {
  if (isDemoMode()) return demoStore.saveKey(provider, apiKey);
  const encrypted = encryptApiKey(apiKey);

  const prisma = getPrisma();
  await prisma.apiKey.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
  const created = await prisma.apiKey.create({
    data: { userId, provider, ...encrypted, isActive: true },
  });
  return { id: created.id, provider: created.provider, createdAt: created.createdAt.toISOString() };
}

export async function deleteApiKey(userId: string, id: string) {
  if (isDemoMode()) {
    demoStore.deleteKey(id);
    return;
  }
  const prisma = getPrisma();
  await prisma.apiKey.updateMany({
    where: { id, userId },
    data: { isActive: false },
  });
}

export async function getActiveKey(userId: string): Promise<{ provider: string; apiKey: string } | null> {
  if (isDemoMode()) {
    const key = demoStore.activeKey();
    if (!key) return null;
    return {
      provider: key.provider,
      apiKey: decryptApiKey(key.encryptedKey, key.iv, key.authTag),
    };
  }

  const prisma = getPrisma();
  const key = await prisma.apiKey.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!key) return null;
  return {
    provider: key.provider,
    apiKey: decryptApiKey(key.encryptedKey, key.iv, key.authTag),
  };
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

  const ownerEmail = process.env.OWNER_EMAIL;
  if (ownerEmail) {
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (owner && !owner.telegramId) {
      const attached = await prisma.user.update({
        where: { id: owner.id },
        data: { telegramId: input.telegramId, telegramUsername: input.username || null },
      });
      return { user: attached };
    }
  }

  const invite = input.startParam?.trim() || '';
  const allowed = invite ? await checkInvite(invite) : false;
  const userCount = await prisma.user.count();
  if (!allowed && userCount > 0) return { error: 'invite' };

  const created = await prisma.user.create({
    data: {
      email: `tg${input.telegramId}@users.jobber.local`,
      telegramId: input.telegramId,
      telegramUsername: input.username || null,
      invitedBy: allowed ? invite : null,
    },
  });
  if (allowed) await consumeInvite(invite, created.id);
  return { user: created };
}

export async function createInvite(user: SessionUser) {
  if (isDemoMode()) return demoStore.createInvite();

  const prisma = getPrisma();
  const count = await prisma.user.count();
  const owner = process.env.OWNER_EMAIL;
  if (owner && user.email !== owner && count > 1) {
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
