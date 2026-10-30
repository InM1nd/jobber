import { NextResponse } from 'next/server';
import { requireUser, setQuietDays } from '@/lib/data/service';
import { QUIET_DAYS } from '@/lib/tracker/attention';

export const instant = false;

/** How many days with no reply count as silence, on the tracker. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { quietDays?: unknown } | null;
  const quietDays = Number(body?.quietDays);
  if (!(QUIET_DAYS as readonly number[]).includes(quietDays)) {
    return NextResponse.json({ error: 'Pick 3, 5, 7, 10, 14, 21 or 30 days' }, { status: 400 });
  }
  try {
    await setQuietDays(user.id, quietDays);
  } catch {
    return NextResponse.json({ error: 'No profile yet' }, { status: 404 });
  }
  return NextResponse.json({ quietDays });
}
