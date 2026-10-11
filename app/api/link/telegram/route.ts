import { NextResponse } from 'next/server';
import { createLinkCode } from '@/lib/auth/link-code';
import { requireUser } from '@/lib/data/service';
import { isDemoMode } from '@/lib/demo/mode';

export const instant = false;

/** Deep link that the bot turns into a Telegram ↔ account link. */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const handle = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || 'JobberCheck_bot';
  if (isDemoMode()) return NextResponse.json({ url: `https://t.me/${handle}` });
  const code = createLinkCode(user.id);
  return NextResponse.json({ url: `https://t.me/${handle}?start=link_${code}` });
}
