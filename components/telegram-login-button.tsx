'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';

/**
 * "Sign in with Telegram" via the bot (no Login Widget / BotFather domain needed):
 * creates a one-time request, opens t.me/<bot>?start=login_<token>, then polls until the
 * user confirms in Telegram. The bot also offers a one-time link for other browsers.
 */
export function TelegramLoginButton({ invite, onDone, onError }: { invite?: string; onDone: () => void; onError: (message: string) => void }) {
  const [state, setState] = useState<'idle' | 'waiting'>('idle');
  const [url, setUrl] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function start() {
    onError('');
    // Open synchronously-ish to avoid popup blockers; fill the URL once we have it.
    const win = window.open('', '_blank');
    const res = await fetch('/api/auth/telegram-bot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invite }) }).catch(() => null);
    const data = res?.ok ? await res.json() : null;
    if (!data?.url) {
      win?.close();
      onError('Could not start Telegram sign-in. Try again.');
      return;
    }
    setUrl(data.url);
    if (win) win.location.href = data.url;
    else window.location.href = data.url;
    setState('waiting');
    const started = Date.now();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const r = await fetch(`/api/auth/telegram-bot?token=${encodeURIComponent(data.token)}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      if (r?.state === 'done') {
        clearInterval(timer.current!);
        onDone();
      } else if (r?.state === 'expired' || Date.now() - started > 5.5 * 60_000) {
        clearInterval(timer.current!);
        setState('idle');
        onError('Sign-in timed out or was already used. Tap the button to try again.');
      }
    }, 2000);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#2AABEE] text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        {state === 'waiting' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {state === 'waiting' ? 'Waiting for Telegram…' : 'Sign in with Telegram'}
      </button>
      {state === 'waiting' && (
        <p className="text-center text-[12.5px] leading-snug text-muted">
          In Telegram, tap <b>Start</b>, then <b>Yes, sign me in</b>. This page continues by itself.{' '}
          {url && <a href={url} target="_blank" rel="noreferrer" className="text-accent">Open Telegram again</a>}
        </p>
      )}
    </div>
  );
}
