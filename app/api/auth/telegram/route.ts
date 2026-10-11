import { NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/auth/session';
import { signInWithTelegram } from '@/lib/data/service';
import { validateTelegramInitData } from '@/lib/telegram/init-data';

export const instant = false;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const initData = String((body as { initData?: string } | null)?.initData || '');
  const invite = String((body as { invite?: string } | null)?.invite || '').trim();
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const parsed = validateTelegramInitData(initData, token);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.reason }, { status: 401 });
  }

  const result = await signInWithTelegram({
    telegramId: String(parsed.user.id),
    username: parsed.user.username,
    startParam: parsed.startParam || invite || undefined,
  });

  if ('error' in result) {
    return NextResponse.json({ error: 'invite' }, { status: 403 });
  }

  await setSessionCookie(result.user.id);
  return NextResponse.json({
    ok: true,
    username: result.user.telegramUsername,
  });
}
