'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { KanbanSquare, Loader2, Settings, Sparkles, UserRound } from 'lucide-react';
import { Logo } from '@/components/ui/kit';
import { ThemeToggle } from '@/components/theme-toggle';
import { applyThemeMode } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import { waitForTelegramInitData, waitForTelegramSdk } from '@/lib/telegram/web-app-launch';

type ThemeParams = Record<string, string | undefined>;

type WebApp = {
  initData: string;
  platform?: string;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  onEvent: (event: string, cb: () => void) => void;
  offEvent: (event: string, cb: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton: {
    setText: (text: string) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

export function getWebApp(): WebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function haptic(kind: 'light' | 'success' | 'error') {
  const feedback = getWebApp()?.HapticFeedback;
  if (!feedback) return;
  if (kind === 'light') feedback.impactOccurred('light');
  else feedback.notificationOccurred(kind);
}

export async function openExternal(url: string) {
  const webApp = getWebApp();
  if (webApp?.openLink) {
    webApp.openLink(url);
    return;
  }
  window.location.href = url;
}

function applyTheme(webApp: WebApp) {
  const root = document.documentElement;
  const safe = webApp.safeAreaInset;
  const content = webApp.contentSafeAreaInset;
  root.style.setProperty('--tg-safe-top', `${(safe?.top || 0) + (content?.top || 0)}px`);
  root.style.setProperty('--tg-safe-bottom', `${(safe?.bottom || 0) + (content?.bottom || 0)}px`);
  root.dataset.tg = '1';
  applyThemeMode();
}

/** telegram-web-app.js also defines WebApp in a normal browser; only theme inside Telegram. */
export function insideTelegram(webApp: WebApp | null = getWebApp()) {
  return Boolean(webApp && (webApp.initData || (webApp.platform && webApp.platform !== 'unknown')));
}

function boot(webApp: WebApp) {
  if (!insideTelegram(webApp)) return () => {};
  webApp.ready();
  webApp.expand();
  hideMainButton(webApp);
  applyTheme(webApp);
  const onChange = () => applyTheme(webApp);
  webApp.onEvent('themeChanged', onChange);
  webApp.onEvent('viewportChanged', onChange);
  webApp.onEvent('safeAreaChanged', onChange);

  return () => {
    webApp.offEvent('themeChanged', onChange);
    webApp.offEvent('viewportChanged', onChange);
    webApp.offEvent('safeAreaChanged', onChange);
  };
}

export function TelegramBoot() {
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    const existing = getWebApp();
    if (existing) {
      cleanup = boot(existing);
      return () => {
        cancelled = true;
        cleanup();
      };
    }

    // The root layout loads telegram-web-app.js before hydration. Telegram
    // does not inject the SDK, and the webview user agent often lacks
    // "Telegram". Sign-in is not started here; AuthGate owns that POST.
    void waitForTelegramSdk({ isReady: () => getWebApp() !== null }).then((ready) => {
      if (cancelled || !ready) return;
      const webApp = getWebApp();
      if (webApp) cleanup = boot(webApp);
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return null;
}

/** Telegram's MainButton is intentionally not used: every screen has its own in-page button. */
function hideMainButton(webApp: WebApp) {
  webApp.MainButton?.hide();
}

export function TelegramBack({ href }: { href: string }) {
  const router = useRouter();
  const go = useRef(() => router.push(href));
  go.current = () => router.push(href);

  useEffect(() => {
    const webApp = getWebApp();
    if (!webApp) return;
    const click = () => go.current();
    webApp.BackButton.show();
    webApp.BackButton.onClick(click);
    return () => {
      webApp.BackButton.offClick(click);
      webApp.BackButton.hide();
    };
  }, []);

  return null;
}

const tabs = [
  { href: '/dashboard/matches', label: 'Matches', icon: Sparkles },
  { href: '/dashboard/tracker', label: 'Tracker', icon: KanbanSquare },
  { href: '/dashboard/profile', label: 'Profile', icon: UserRound },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Highlights the tapped tab immediately, before the route commits. */
function useOptimisticPath() {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [pathname]);
  return { path: pending ?? pathname, go: setPending };
}

export function BottomNav() {
  const { path: pathname, go } = useOptimisticPath();
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(12px+var(--safe-bottom))] md:hidden">
      <div className="pointer-events-auto mx-auto flex h-16 max-w-md items-center gap-1 rounded-full bg-[#111111] px-2 shadow-[0_8px_28px_-6px_rgb(0_0_0/0.35)] dark:bg-[#1c1c1f]">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              onClick={() => {
                haptic('light');
                go(tab.href);
              }}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
              className={cn(
                'flex h-12 items-center justify-center gap-2 rounded-full transition-[flex,background-color] duration-300 ease-out active:scale-[0.94]',
                active ? 'flex-[1.9] bg-accent text-accent-fg' : 'flex-1 text-[#8e8e93] hover:text-white',
              )}
            >
              <Icon className="size-[21px]" strokeWidth={active ? 2.2 : 1.6} />
              {active && <span className="animate-in text-[14px] font-semibold tracking-[-0.01em]">{tab.label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Sidebar({ account }: { account: string }) {
  const { path: pathname, go } = useOptimisticPath();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
      <Link href="/" className="px-3 pb-6"><Logo /></Link>
      <nav className="flex flex-col gap-0.5">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              onClick={() => go(tab.href)}
              className={cn(
                'flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[14px] transition-colors',
                active ? 'bg-fg font-semibold text-bg [&_svg]:text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon className="size-4" strokeWidth={active ? 2 : 1.6} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 px-3">
        <span className="min-w-0 truncate text-[12.5px] text-muted">{account}</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}


const OPEN_FROM_TELEGRAM = 'Open Jobber from the Telegram chat. The menu button is under the message field.';

let signInFlight: Promise<Response> | null = null;
let signInKey = '';

function postTelegramSignIn(initData: string, invite?: string): Promise<Response> {
  const key = `${initData}\0${invite || ''}`;
  if (signInFlight && signInKey === key) return signInFlight;
  signInKey = key;
  const request = fetch('/api/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, invite: invite || undefined }),
  });
  signInFlight = request.finally(() => {
    if (signInKey === key) {
      signInFlight = null;
      signInKey = '';
    }
  });
  return signInFlight;
}

export function AuthGate() {
  const router = useRouter();
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(true);
  const [needsInvite, setNeedsInvite] = useState(false);
  const initDataRef = useRef('');

  async function submit(code?: string) {
    const initData = initDataRef.current.trim();
    if (!initData) {
      setWaiting(false);
      setError(OPEN_FROM_TELEGRAM);
      return;
    }
    setWaiting(true);
    setError('');
    const response = await postTelegramSignIn(initData, code);
    const body = await response.json().catch(() => ({}));
    setWaiting(false);
    if (response.status === 403 && body.error === 'invite') {
      setNeedsInvite(true);
      setError('This invite code is not valid.');
      return;
    }
    if (!response.ok) {
      setError(body.error || 'Telegram did not accept this session.');
      return;
    }
    haptic('success');
    router.refresh();
  }

  useEffect(() => {
    let cancelled = false;
    const inviteFromUrl = new URLSearchParams(window.location.search).get('invite') || undefined;
    void waitForTelegramInitData({
      readSdkInitData: () => getWebApp()?.initData,
      readHash: () => window.location.hash,
      isSdkReady: () => getWebApp() !== null,
    }).then((initData) => {
      if (cancelled) return;
      initDataRef.current = initData;
      if (!initData) {
        setWaiting(false);
        setError(OPEN_FROM_TELEGRAM);
        return;
      }
      void submit(inviteFromUrl);
    });
    return () => {
      cancelled = true;
    };
    // Sign in once, after the SDK or the launch hash can supply initData.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-full max-w-sm animate-in">
        <div className="mx-auto mb-6 flex justify-center"><Logo className="text-lg" /></div>
        {waiting ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Signing you in with Telegram…
          </p>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Open Jobber in Telegram</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Tap the <span className="font-medium text-fg">Open</span> button under the message field in @JobberCheck_bot, or sign in on the web.
            </p>
          </>
        )}
        {needsInvite && (
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(invite);
            }}
          >
            <input
              className="w-full rounded-[8px] border border-line-strong bg-bg px-3 py-2 text-[15px] outline-none focus:border-fg"
              placeholder="Invite code"
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
            />
            <button className="h-10 w-full rounded-[8px] bg-accent text-sm font-medium text-accent-fg" type="submit">
              Continue
            </button>
          </form>
        )}
        {error && !waiting && error !== OPEN_FROM_TELEGRAM && <p className="mt-4 text-sm text-danger">{error}</p>}
        {!waiting && (
          <Link
            href="/auth/signin"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-[8px] border border-line-strong text-sm font-medium"
          >
            Sign in on the web
          </Link>
        )}
      </div>
    </div>
  );
}
