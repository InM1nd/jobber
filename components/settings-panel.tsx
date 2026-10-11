'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Copy, KeyRound, Mail, Send, Sparkles, Ticket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Group, Notice, Row, fieldClass } from '@/components/ui/kit';
import { haptic, openExternal } from '@/components/telegram-ui';
import { TelegramLoginButton } from '@/components/telegram-login-button';
import { createClient } from '@/lib/db/supabase';
import type { LinkedAccounts } from '@/lib/data/service';

const PROVIDERS = [
  ['openrouter', 'OpenRouter'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['gemini', 'Gemini'],
  ['xai', 'xAI'],
] as const;

function providerName(id: string) {
  return PROVIDERS.find(([key]) => key === id)?.[1] || id;
}

export function SettingsPanel({
  keys,
  accounts,
  emailLinkToken,
  botUsername,
  isOwner,
  notice,
  error: initialError,
}: {
  keys: { id: string; provider: string; createdAt: string }[];
  accounts: LinkedAccounts;
  emailLinkToken: string | null;
  botUsername: string;
  isOwner: boolean;
  notice?: string;
  error?: string;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [invite, setInvite] = useState('');
  const [email, setEmail] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showTelegramOptions, setShowTelegramOptions] = useState(false);
  const [message, setMessage] = useState(notice || '');
  const [error, setError] = useState(initialError || '');

  function reset() {
    setError('');
    setMessage('');
  }

  async function saveKey(event: React.FormEvent) {
    event.preventDefault();
    reset();
    const response = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || 'Could not save the key');
      haptic('error');
      return;
    }
    setApiKey('');
    setShowKeyForm(false);
    setMessage('Key saved. It’s encrypted and never shown again.');
    haptic('success');
    router.refresh();
  }

  async function removeKey(id: string) {
    await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
    router.refresh();
  }

  async function connectOpenRouter() {
    reset();
    haptic('light');
    const response = await fetch('/api/auth/openrouter/start', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.url) {
      setError(body.error || 'Could not start OpenRouter');
      haptic('error');
      return;
    }
    await openExternal(body.url);
  }

  async function linkTelegramViaBot() {
    reset();
    const response = await fetch('/api/link/telegram', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.url) {
      setError(body.error || 'Could not create a link');
      return;
    }
    window.open(body.url, '_blank', 'noopener');
    setMessage('Press Start in the bot, then come back and refresh this page.');
  }

  async function linkEmail(event: React.FormEvent) {
    event.preventDefault();
    reset();
    if (!emailLinkToken) {
      setError('Email linking is not available here.');
      return;
    }
    try {
      const supabase = createClient();
      const redirect = new URL('/auth/callback', window.location.origin);
      redirect.searchParams.set('link', 'email');
      redirect.searchParams.set('t', emailLinkToken);
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect.toString() },
      });
      if (otpError) setError(otpError.message);
      else {
        setMessage(`We sent a link to ${email}. Open it on any device to finish linking.`);
        setShowEmailForm(false);
      }
    } catch {
      setError('Email sign-in is not configured.');
    }
  }

  async function unlink(kind: 'telegram' | 'email') {
    reset();
    const response = await fetch('/api/link/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || 'Could not unlink');
      return;
    }
    setMessage(kind === 'email' ? 'Email unlinked.' : 'Telegram unlinked.');
    router.refresh();
  }

  async function makeInvite() {
    reset();
    const response = await fetch('/api/invites', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || 'Could not create an invite');
      return;
    }
    setInvite(body.code);
  }

  const canUnlinkTelegram = Boolean(accounts.telegram && accounts.email);
  const canUnlinkEmail = Boolean(accounts.email && accounts.telegram);

  return (
    <div className="space-y-6">
      {message && <Notice tone="success">{message}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <Group
        title="AI connection"
        footer="Jobber never pays for or sees your model usage. Keys are encrypted with AES-256-GCM."
      >
        {keys.map((key) => (
          <Row
            key={key.id}
            icon={KeyRound}
            iconTone="success"
            label={providerName(key.provider)}
            detail={`Connected ${new Date(key.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            trailing={
              <button type="button" onClick={() => removeKey(key.id)} className="rounded-full p-2 text-subtle hover:bg-danger-soft hover:text-danger" aria-label="Remove key">
                <Trash2 className="size-4" />
              </button>
            }
          />
        ))}
        <button type="button" onClick={connectOpenRouter} className="block w-full text-left transition-colors hover:bg-surface-2">
          <Row icon={Sparkles} label="Connect OpenRouter" detail="Recommended · one login, every model" trailing={<ChevronRight className="size-4 text-subtle" />} />
        </button>
        {showKeyForm ? (
          <form onSubmit={saveKey} className="animate-in space-y-2.5 p-4">
            <div className="grid grid-cols-5 gap-1 rounded-[8px] bg-surface-2 p-0.5">
              {PROVIDERS.map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProvider(id)}
                  className={`truncate rounded-[6px] px-1 py-1.5 text-[11.5px] font-medium transition-all ${provider === id ? 'bg-bg text-fg' : 'text-muted'}`}
                >
                  {name}
                </button>
              ))}
            </div>
            <input className={fieldClass} type="password" autoComplete="off" placeholder={`${providerName(provider)} API key`} value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowKeyForm(false)}>Cancel</Button>
              <Button type="submit" className="flex-1">Save key</Button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setShowKeyForm(true)} className="block w-full text-left transition-colors hover:bg-surface-2">
            <Row icon={KeyRound} iconTone="neutral" label="Paste an API key" detail="OpenAI, Anthropic, Gemini, xAI" trailing={<ChevronRight className="size-4 text-subtle" />} />
          </button>
        )}
      </Group>

      <Group title="Linked accounts" footer="Both sign-ins open the same account, so the Telegram app and the website share matches, tracker and settings.">
        <Row
          icon={Send}
          iconTone="telegram"
          label="Telegram"
          detail={accounts.telegram ? (accounts.telegram.username ? `@${accounts.telegram.username}` : `ID ${accounts.telegram.id}`) : 'Not linked'}
          trailing={
            accounts.telegram ? (
              canUnlinkTelegram ? (
                <Button size="sm" variant="ghost" onClick={() => unlink('telegram')}>Unlink</Button>
              ) : (
                <span className="text-[12px] text-muted">Linked</span>
              )
            ) : (
              <Button size="sm" variant="soft" onClick={() => setShowTelegramOptions((v) => !v)}>Link</Button>
            )
          }
        />
        {!accounts.telegram && showTelegramOptions && (
          <div className="animate-in space-y-3 p-4">
            <TelegramLoginButton bot={botUsername} mode="link" size="medium" onDone={() => router.refresh()} onError={setError} />
            <p className="text-center text-[12px] text-subtle">or</p>
            <Button variant="outline" className="w-full" onClick={linkTelegramViaBot}>
              <Send /> Open @{botUsername}
            </Button>
          </div>
        )}
        <Row
          icon={Mail}
          label="Email"
          detail={accounts.email || 'Not linked · sign in on the web with email'}
          trailing={
            accounts.email ? (
              canUnlinkEmail ? (
                <Button size="sm" variant="ghost" onClick={() => unlink('email')}>Unlink</Button>
              ) : (
                <span className="text-[12px] text-muted">Linked</span>
              )
            ) : (
              <Button size="sm" variant="soft" onClick={() => setShowEmailForm((v) => !v)}>Link</Button>
            )
          }
        />
        {!accounts.email && showEmailForm && (
          <form onSubmit={linkEmail} className="animate-in flex gap-2 p-4">
            <input className={fieldClass} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Button type="submit">Send link</Button>
          </form>
        )}
      </Group>

      {isOwner && (
        <Group title="Invites" footer="Share a code with a friend. Each code works once and expires in 90 days.">
          <Row
            icon={Ticket}
            iconTone="warning"
            label={invite ? <code className="font-mono text-[14px]">{invite}</code> : 'Invite a friend'}
            detail={invite ? `t.me/${botUsername}?start=${invite}` : undefined}
            trailing={
              invite ? (
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(`https://t.me/${botUsername}?start=${invite}`)}>
                  <Copy /> Copy
                </Button>
              ) : (
                <Button size="sm" variant="soft" onClick={makeInvite}>Create</Button>
              )
            }
          />
        </Group>
      )}

    </div>
  );
}
