'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { createClient } from '@/lib/db/supabase';

const COOLDOWN_SECONDS = 60;

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string; at: number }
  | { kind: 'error'; message: string };

/**
 * Supabase magic link with an explicit sent state: inline card, toast,
 * resend with a cooldown, and a clear error.
 */
export function EmailLinkForm({
  redirectTo,
  submitLabel = 'Email me a link',
  initialState,
}: {
  /** Absolute URL or a path on this origin. */
  redirectTo: string;
  submitLabel?: string;
  /** Only for previews/screenshots. */
  initialState?: State;
}) {
  const [email, setEmail] = useState(initialState?.kind === 'sent' ? initialState.email : '');
  const [state, setState] = useState<State>(initialState ?? { kind: 'idle' });
  const [now, setNow] = useState(0);
  const [toast, setToast] = useState(initialState?.kind === 'sent');

  useEffect(() => {
    if (state.kind !== 'sent') return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.kind]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(false), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  async function send(target: string) {
    setState({ kind: 'sending' });
    try {
      const supabase = createClient();
      const url = new URL(redirectTo, window.location.origin).toString();
      const { error } = await supabase.auth.signInWithOtp({ email: target, options: { emailRedirectTo: url } });
      if (error) {
        const wait = /rate|seconds|security purposes/i.test(error.message);
        setState({ kind: 'error', message: wait ? 'Too many emails in a row. Wait a minute and try again.' : error.message });
        haptic('error');
        return;
      }
      setState({ kind: 'sent', email: target, at: Date.now() });
      setNow(Date.now());
      setToast(true);
      haptic('success');
    } catch {
      setState({ kind: 'error', message: 'Email sign-in is not configured here.' });
      haptic('error');
    }
  }

  const remaining = state.kind === 'sent' && now ? Math.max(0, COOLDOWN_SECONDS - Math.floor((now - state.at) / 1000)) : state.kind === 'sent' ? COOLDOWN_SECONDS : 0;

  return (
    <>
      {toast && state.kind === 'sent' && (
        <div role="status" className="fixed inset-x-0 top-[calc(12px+var(--safe-top))] z-50 flex justify-center px-4">
          <div className="animate-in flex items-center gap-2 rounded-full bg-fg px-4 py-2.5 text-[13.5px] font-medium text-bg shadow-[0_8px_28px_-6px_rgb(0_0_0/0.35)]">
            <CheckCircle2 className="size-4 text-accent" /> Link sent to {state.email}
          </div>
        </div>
      )}

      {state.kind === 'sent' ? (
        <div className="animate-in rounded-[18px] border border-accent/40 bg-accent-soft p-5" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
              <Mail className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold tracking-[-0.01em]">Check your inbox</p>
              <p className="mt-0.5 break-all text-[14px] text-muted">
                We sent a sign-in link to <span className="font-medium text-fg">{state.email}</span>. It expires in 1 hour.
              </p>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] text-muted">Nothing there? Check spam or promotions.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={remaining > 0} onClick={() => send(state.email)}>
              <RotateCw /> {remaining > 0 ? `Resend in ${remaining}s` : 'Resend link'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setState({ kind: 'idle' })}>
              Use another email
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(email.trim());
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className={fieldClass}
          />
          {state.kind === 'error' && (
            <p className="flex items-start gap-2 rounded-[12px] border border-danger/30 px-3 py-2.5 text-[13px] text-danger" role="alert">
              <AlertCircle className="mt-px size-4 shrink-0" /> {state.message}
            </p>
          )}
          <Button type="submit" variant="outline" disabled={state.kind === 'sending'} className="w-full">
            <Mail /> {state.kind === 'sending' ? 'Sending…' : submitLabel}
          </Button>
        </form>
      )}
    </>
  );
}
