export type ThemeMode = 'system' | 'light' | 'dark';

export function savedThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem('theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** "System" means the OS on the web, and Telegram's colorScheme inside the Mini App. */
export function applyThemeMode(mode: ThemeMode = savedThemeMode()) {
  const tg = (window as unknown as { Telegram?: { WebApp?: { colorScheme?: string; initData?: string; platform?: string; setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void } } }).Telegram?.WebApp;
  const inTelegram = Boolean(tg && (tg.initData || (tg.platform && tg.platform !== 'unknown')));
  const systemDark = inTelegram ? tg?.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (inTelegram) {
    const page = dark ? '#000000' : '#ffffff';
    tg?.setHeaderColor?.(page);
    tg?.setBackgroundColor?.(page);
  }
}
