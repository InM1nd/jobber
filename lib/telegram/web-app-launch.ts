/** How long to wait for the Telegram script or launch hash before treating init data as empty. */
export const TELEGRAM_SDK_WAIT_MS = 2000;
export const TELEGRAM_SDK_POLL_MS = 50;

export const TELEGRAM_WEB_APP_SDK = 'https://telegram.org/js/telegram-web-app.js';

function urlSafeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

/**
 * Read `tgWebAppData` the same way telegram-web-app.js reads `location.hash`.
 * Telegram puts the Mini App init data in that hash parameter on iOS, Android,
 * Desktop, and Web. The value is the initData query string.
 */
export function initDataFromLocationHash(hash: string): string {
  let locationHash = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!locationHash) return '';
  if (!locationHash.includes('=') && !locationHash.includes('?')) return '';
  const queryIndex = locationHash.indexOf('?');
  if (queryIndex >= 0) locationHash = locationHash.slice(queryIndex + 1);
  let initData = '';
  for (const part of locationHash.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const name = urlSafeDecode(eq === -1 ? part : part.slice(0, eq));
    const value = eq === -1 ? '' : urlSafeDecode(part.slice(eq + 1));
    if (name === 'tgWebAppData') initData = value;
  }
  return initData.trim();
}

/** SDK initData wins when it is already filled. Otherwise use the launch hash. */
export function resolveTelegramInitData(sdkInitData: string | null | undefined, hash: string): string {
  const fromSdk = (sdkInitData || '').trim();
  if (fromSdk) return fromSdk;
  return initDataFromLocationHash(hash);
}

export async function waitForTelegramSdk(args: {
  isReady: () => boolean;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<boolean> {
  const timeoutMs = args.timeoutMs ?? TELEGRAM_SDK_WAIT_MS;
  const intervalMs = args.intervalMs ?? TELEGRAM_SDK_POLL_MS;
  const sleep = args.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = args.now ?? Date.now;
  const start = now();
  for (;;) {
    if (args.isReady()) return true;
    if (now() - start >= timeoutMs) return false;
    await sleep(intervalMs);
  }
}

export async function waitForTelegramInitData(args: {
  readSdkInitData: () => string | null | undefined;
  readHash: () => string;
  isSdkReady: () => boolean;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<string> {
  const timeoutMs = args.timeoutMs ?? TELEGRAM_SDK_WAIT_MS;
  const intervalMs = args.intervalMs ?? TELEGRAM_SDK_POLL_MS;
  const sleep = args.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = args.now ?? Date.now;
  const start = now();
  for (;;) {
    const fromSdk = (args.readSdkInitData() || '').trim();
    if (fromSdk) return fromSdk;
    // The script parsed the launch URL. Its initData is empty, so use the hash.
    if (args.isSdkReady()) return initDataFromLocationHash(args.readHash());
    if (now() - start >= timeoutMs) return initDataFromLocationHash(args.readHash());
    await sleep(intervalMs);
  }
}
