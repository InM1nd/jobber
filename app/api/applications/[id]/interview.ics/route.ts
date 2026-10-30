import { requireUser } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';
import { icsFor, interviewStart, interviewTitle } from '@/lib/replies/calendar';

export const instant = false;

/** The application's next interview as an .ics file (Apple Calendar, Outlook). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Sign in required', { status: 401 });
  const { id } = await context.params;
  const app = await getPrisma().application.findFirst({ where: { id, userId: user.id }, select: { id: true, company: true, role: true, notes: true, url: true, interviewAt: true } });
  const start = app ? interviewStart(app) : null;
  if (!app || !start) return new Response('No interview time on this application', { status: 404 });
  const ics = icsFor({ title: interviewTitle(app.company, app.role), start, details: app.url || undefined }, app.id);
  return new Response(ics, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename="interview-${app.company.replace(/[^\w-]+/g, '-').slice(0, 40)}.ics"` },
  });
}
