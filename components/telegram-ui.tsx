'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

type ThemeParams = Record<string, string | undefined>;

type WebApp = {
  initData: string;
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
  const theme = webApp.themeParams || {};
  const root = document.documentElement;
  const set = (name: string, value?: string) => {
    if (value) root.style.setProperty(name, value);
  };
  set('--tg-bg', theme.bg_color);
  set('--tg-text', theme.text_color);
  set('--tg-hint', theme.hint_color);
  set('--tg-link', theme.link_color);
  set('--tg-button', theme.button_color);
  set('--tg-button-text', theme.button_text_color);
  set('--tg-secondary-bg', theme.secondary_bg_color);
  set('--tg-section', theme.section_bg_color || theme.secondary_bg_color);
  const safe = webApp.safeAreaInset;
  const content = webApp.contentSafeAreaInset;
  root.style.setProperty('--tg-safe-top', `${(safe?.top || 0) + (content?.top || 0)}px`);
  root.style.setProperty('--tg-safe-bottom', `${(safe?.bottom || 0) + (content?.bottom || 0)}px`);
  root.dataset.theme = webApp.colorScheme;
  if (theme.bg_color) {
    webApp.setHeaderColor?.(theme.bg_color);
    webApp.setBackgroundColor?.(theme.bg_color);
  }
}

export function TelegramBoot() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const webApp = getWebApp();
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    applyTheme(webApp);
    const onChange = () => applyTheme(webApp);
    webApp.onEvent('themeChanged', onChange);
    webApp.onEvent('viewportChanged', onChange);
    webApp.onEvent('safeAreaChanged', onChange);

    if (webApp.initData && (pathname === '/' || pathname.startsWith('/dashboard'))) {
      const invite = new URLSearchParams(window.location.search).get('invite') || undefined;
      void fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: webApp.initData, invite }),
      }).then((response) => {
        if (response.ok) router.refresh();
      });
    }

    return () => {
      webApp.offEvent('themeChanged', onChange);
      webApp.offEvent('viewportChanged', onChange);
      webApp.offEvent('safeAreaChanged', onChange);
    };
  }, [pathname, router]);

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
  { href: '/dashboard/matches', label: 'Matches' },
  { href: '/dashboard/tracker', label: 'Tracker' },
  { href: '/dashboard/profile', label: 'Profile' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-[var(--tg-bg,#fff)] pb-[var(--tg-safe-bottom)]">
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-2 py-3 text-center text-xs ${active ? 'font-semibold text-[var(--tg-link,#15803d)]' : 'text-[var(--tg-hint,#6b7280)]'}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AuthGate() {
  const router = useRouter();
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(true);
  const [needsInvite, setNeedsInvite] = useState(false);

  async function submit(code?: string) {
    const webApp = getWebApp();
    if (!webApp?.initData) {
      setWaiting(false);
      setError('Open Jobber from the Telegram chat. The menu button is under the message field.');
      return;
    }
    setWaiting(true);
    setError('');
    const response = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: webApp.initData, invite: code || undefined }),
    });
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
    const timer = window.setTimeout(() => {
      void submit(new URLSearchParams(window.location.search).get('invite') || undefined);
    }, 50);
    return () => window.clearTimeout(timer);
    // Run once on mount. submit reads the latest invite from the argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-semibold">Jobber</h1>
      <p className="mt-3 text-sm text-[var(--tg-hint,#52525b)]">
        {waiting ? 'Checking Telegram…' : 'Sign in with the Telegram account that opened this app.'}
      </p>
      {needsInvite && (
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(invite);
          }}
        >
          <input
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm"
            placeholder="Invite code"
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
          />
          <button className="rounded-md bg-green-700 px-4 py-2 text-sm text-white" type="submit">
            Continue
          </button>
        </form>
      )}
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <Link href="/auth/signin" className="mt-8 text-sm text-[var(--tg-link,#15803d)]">
        Email sign-in instead
      </Link>
    </div>
  );
}
