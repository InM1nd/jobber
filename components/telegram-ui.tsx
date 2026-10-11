'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { KanbanSquare, Loader2, Settings, Sparkles, UserRound } from 'lucide-react';
import { Logo } from '@/components/ui/kit';
import { ThemeToggle } from '@/components/theme-toggle';
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
  root.dataset.theme = webApp.colorScheme;
  root.dataset.tg = '1';
  const page = webApp.colorScheme === 'dark' ? '#0a0a0a' : '#ffffff';
  webApp.setHeaderColor?.(page);
  webApp.setBackgroundColor?.(page);
}

/** telegram-web-app.js also defines WebApp in a normal browser; only theme inside Telegram. */
export function insideTelegram(webApp: WebApp | null = getWebApp()) {
  return Boolean(webApp && (webApp.initData || (webApp.platform && webApp.platform !== 'unknown')));
}

function boot(webApp: WebApp) {
  if (!insideTelegram(webApp)) return () => {};
  webApp.ready();
  webApp.expand();
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

export function useMainButton(text: string | null, onClick: () => void) {
  const handler = useRef(onClick);
  handler.current = onClick;

  useEffect(() => {
    const webApp = getWebApp();
    if (!webApp || !text) return;
    const click = () => handler.current();
    webApp.MainButton.setText(text);
    webApp.MainButton.enable();
    webApp.MainButton.show();
    webApp.MainButton.onClick(click);
    return () => {
      webApp.MainButton.offClick(click);
      webApp.MainButton.hide();
    };
  }, [text]);
}

export function useMainButtonProgress(pending: boolean) {
  useEffect(() => {
    const button = getWebApp()?.MainButton;
    if (!button) return;
    if (pending) {
      button.showProgress(false);
      button.disable();
    } else {
      button.hideProgress();
      button.enable();
    }
  }, [pending]);
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

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[var(--safe-bottom)] backdrop-blur-md md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-4 px-2">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => haptic('light')}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px] font-medium transition-colors',
                active ? 'text-accent' : 'text-subtle hover:text-muted active:text-fg',
              )}
            >
              <Icon className="size-[20px]" strokeWidth={active ? 2 : 1.6} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Sidebar({ account }: { account: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
      <Link href="/" className="px-3 pb-6"><Logo /></Link>
      <nav className="flex flex-col gap-0.5">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-2.5 rounded-[8px] px-3 py-1.5 text-[13.5px] transition-colors',
                active ? 'bg-surface-2 font-medium text-fg [&_svg]:text-accent' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
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
