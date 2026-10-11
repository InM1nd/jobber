'use client';

import { useEffect, useRef } from 'react';

type Payload = Record<string, string | number>;

declare global {
  interface Window {
    __jobberTelegramAuth?: (user: Payload) => void;
  }
}

/**
 * Official Telegram Login Widget. Requires BotFather /setdomain for this host.
 * mode="link" attaches Telegram to the signed-in account instead of signing in.
 */
export function TelegramLoginButton({
  bot,
  mode = 'signin',
  invite,
  onDone,
  onError,
  size = 'large',
}: {
  bot: string;
  mode?: 'signin' | 'link';
  invite?: string;
  onDone: () => void;
  onError: (message: string) => void;
  size?: 'large' | 'medium' | 'small';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  const fail = useRef(onError);
  done.current = onDone;
  fail.current = onError;

  useEffect(() => {
    window.__jobberTelegramAuth = async (user) => {
      const response = await fetch('/api/auth/telegram-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, mode, invite }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        fail.current(body.error === 'invite' ? 'You need an invite code to join. Ask the person who shared Jobber.' : body.error || 'Telegram sign-in failed');
        return;
      }
      done.current();
    };
    const host = ref.current;
    if (!host) return;
    host.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', bot);
    script.setAttribute('data-size', size);
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', '__jobberTelegramAuth(user)');
    host.appendChild(script);
    return () => {
      host.innerHTML = '';
    };
  }, [bot, mode, invite, size]);

  return <div ref={ref} className="flex min-h-10 justify-center" />;
}
