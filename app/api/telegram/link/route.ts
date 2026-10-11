import { NextResponse } from 'next/server';
import { linkTelegram, requireUser } from '@/lib/data/service';

export const instant = false;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const telegramId = String((body as { telegramId?: string } | null)?.telegramId || '').trim();
  const username = String((body as { username?: string } | null)?.username || '').replace(/^@/, '').trim();
  if (!/^\d{4,20}$/.test(telegramId)) {
    return NextResponse.json({ error: 'Telegram id should be the numeric id from the bot' }, { status: 400 });
  }

  try {
    await linkTelegram(user.id, telegramId, username || undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not link Telegram';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
