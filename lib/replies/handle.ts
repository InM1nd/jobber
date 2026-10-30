import { getPrisma } from '@/lib/db/prisma';
import { classifyReply, nextActionFor, noteLine, statusFor, type AppCandidate, type ReplyReading } from './classify';

type AppRow = { id: string; company: string; role: string; status: string; notes: string | null };

export interface ReplyOutcome {
  reading: ReplyReading;
  application: { id: string; company: string; role: string } | null;
  previousStatus: string | null;
  /** The status it was moved to, or null when unchanged. */
  newStatus: string | null;
}

/**
 * Reads an employer reply and, when `apply` is set and it clearly belongs to one application,
 * updates that application: status, a dated note, the next action. Never sends anything.
 */
export async function handleReply(userId: string, text: string, opts: { applicationId?: string; apply?: boolean } = {}): Promise<ReplyOutcome> {
  const prisma = getPrisma();
  const [rowsRaw, profile, cv] = await Promise.all([
    prisma.application.findMany({
      where: { userId, ...(opts.applicationId ? { id: opts.applicationId } : { status: { notIn: ['skip'] } }) },
      orderBy: { updatedAt: 'desc' },
      take: 60,
      select: { id: true, company: true, role: true, status: true, notes: true },
    }),
    prisma.profile.findUnique({ where: { userId }, select: { facts: true, fullName: true, cvText: true } }),
    prisma.cv.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { text: true } }),
  ]);
  const rows: AppRow[] = rowsRaw;
  const apps: AppCandidate[] = rows.map(({ id, company, role, status }) => ({ id, company, role, status }));
  const reading = await classifyReply(userId, {
    text, apps, facts: profile?.facts ?? null, fullName: profile?.fullName ?? null, cvText: cv?.text || profile?.cvText || null,
  });
  // A reply pasted on one application is about that application.
  if (opts.applicationId && rows[0]) reading.applicationId = rows[0].id;
  const app = rows.find((r) => r.id === reading.applicationId) || null;
  if (!app) return { reading, application: null, previousStatus: null, newStatus: null };

  const newStatus = statusFor(reading.kind, app.status);
  if (opts.apply) {
    const nextAction = nextActionFor(reading);
    await prisma.application.update({
      where: { id: app.id },
      data: {
        ...(newStatus ? { status: newStatus } : {}),
        ...(newStatus === 'applied' ? { appliedAt: new Date(), followUpAt: new Date(Date.now() + 7 * 864e5), followUpSent: false } : {}),
        ...(newStatus === 'rejected' || newStatus === 'offer' ? { followUpAt: null } : {}),
        notes: [app.notes?.trim(), noteLine(reading)].filter(Boolean).join('\n'),
        ...(reading.interviewAt && !Number.isNaN(Date.parse(reading.interviewAt)) ? { interviewAt: new Date(reading.interviewAt) } : {}),
        ...(nextAction ? { nextAction } : {}),
      },
    });
  }
  return { reading, application: { id: app.id, company: app.company, role: app.role }, previousStatus: app.status, newStatus };
}
