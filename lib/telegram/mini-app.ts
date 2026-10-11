export function miniAppUrl(invite?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || '';
  if (!base) return '';
  const url = new URL('/dashboard/matches', base);
  if (invite) url.searchParams.set('invite', invite);
  return url.toString();
}

export function telegramStartAppLink(invite?: string): string {
  const handle = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
  const shortName = process.env.TELEGRAM_MINI_APP_SHORT_NAME;
  if (!handle || !shortName) return '';
  const url = new URL(`https://t.me/${handle}/${shortName}`);
  if (invite) url.searchParams.set('startapp', invite);
  return url.toString();
}
