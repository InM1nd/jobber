import { NextResponse } from 'next/server';
import { readSessionUserId, setSessionCookie } from '@/lib/auth/session';
import { validateTelegramLogin } from '@/lib/auth/telegram-login';
import { linkTelegramToUser, signInWithTelegram } from '@/lib/data/service';

export const instant = false;

/**
 * Telegram Login Widget on the web. With an existing session it links the
 * Telegram account to it; otherwise it signs in (same User as the Mini App).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { invite, mode, ...payload } = body;
  const checked = validateTelegramLogin(payload, process.env.TELEGRAM_BOT_TOKEN || '');
  if (!checked.ok) return NextResponse.json({ error: checked.reason }, { status: 401 });

  const current = mode === 'link' ? await readSessionUserId() : null;
  if (current) {
    const linked = await linkTelegramToUser(current, checked.id, checked.username);
    if (!linked.ok) return NextResponse.json({ error: linked.error }, { status: 409 });
    return NextResponse.json({ ok: true, linked: true });
  }

  const result = await signInWithTelegram({
    telegramId: checked.id,
    username: checked.username,
    startParam: typeof invite === 'string' ? invite : undefined,
  });
  if ('error' in result) return NextResponse.json({ error: 'invite' }, { status: 403 });
  await setSessionCookie(result.user.id);
  return NextResponse.json({ ok: true });
}
