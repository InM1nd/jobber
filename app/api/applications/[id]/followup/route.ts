import { NextResponse } from 'next/server';
import { getApplications, getProfile, requireUser } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import { demoStore } from '@/lib/demo/store';
import { aiErrorResponse } from '@/lib/ai/errors';
import { draftFollowUp, followUpPlan } from '@/lib/tracker/followup';

export const instant = false;
export const maxDuration = 30;
const DAY = 86400000;
const CHANNELS = { email: 'email', linkedin: 'LinkedIn message (after they accepted the connect)', careers: 'email to the company careers contact' } as const;

/** POST {action:"draft", channel} → {draft}  (never sent anywhere) · {action:"done", channel} → logs a note, sets the next follow-up date. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; channel?: string };
  const channel = (body.channel && body.channel in CHANNELS ? body.channel : 'email') as keyof typeof CHANNELS;
  const app = (await getApplications(user.id)).find((a) => a.id === id);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const plan = followUpPlan(app);

  if (body.action === 'done') {
    const now = new Date();
    const line = `${now.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}: Followed up (${channel === 'linkedin' ? 'LinkedIn' : channel === 'careers' ? 'careers contact' : 'email'})`;
    const notes = [app.notes, line].filter(Boolean).join('\n');
    const applied = app.appliedAt ? new Date(app.appliedAt).getTime() : now.getTime();
    const next = plan.count === 0 ? new Date(Math.max(applied + 14 * DAY, now.getTime() + 5 * DAY)) : null;
    if (isDemoMode()) {
      demoStore.updateApplication(id, { notes, followUpAt: next?.toISOString() ?? null, followUpSent: false, updatedAt: now.toISOString() });
    } else {
      await getPrisma().application.update({ where: { id }, data: { notes, followUpAt: next, followUpSent: false } });
    }
    return NextResponse.json({ ok: true, notes, followUpAt: next?.toISOString() ?? null });
  }

  if (isDemoMode()) {
    return NextResponse.json({
      draft:
        (channel === 'email' ? `Subject: ${app.role} application — Oleksandr Zabolotnyi\n\n` : '') +
        `Hi,\n\nI applied for the ${app.role} role at ${app.company} last week and wanted to check in. ${app.whyFit ? `The part I keep thinking about is ${app.whyFit.charAt(0).toLowerCase()}${app.whyFit.slice(1).replace(/\.$/, '')}, which is close to what I build at marswalk media.` : ''} I live in Vienna and can start on 1 November.\n\nIf it helps, I'm happy to walk you through a project on a short call.\n\nBest,\nOleksandr`,
    });
  }
  try {
    const profile = await getProfile(user.id);
    const draft = await draftFollowUp(user.id, {
      company: app.company, role: app.role, appliedAt: app.appliedAt, notes: app.notes, whyFit: app.whyFit ?? null,
      channel: CHANNELS[channel], count: plan.count, writingRules: profile.writingRules ?? null, fullName: (profile as { fullName?: string | null }).fullName ?? null,
    });
    return NextResponse.json({ draft });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
