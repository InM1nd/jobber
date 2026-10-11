'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Copy, Gauge, Mail, PenLine, Send, Sparkles, Ticket } from 'lucide-react';
import { EmailLinkForm } from '@/components/email-link-form';
import { InstallApp } from '@/components/pwa';
import { ThemeSegmented } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Group, Notice, Row, fieldClass } from '@/components/ui/kit';
import { GeminiKeyCard } from '@/components/gemini-key';
import { haptic, insideTelegram } from '@/components/telegram-ui';
import type { LinkedAccounts } from '@/lib/data/service';

export function SettingsPanel({
  usage,
  geminiKey,
  shared,
  accounts,
  botUsername,
  isOwner,
  demo,
}: {
  usage: { limits: { score: number; write: number; parse: number }; used: { score: number; write: number; parse: number } };
  geminiKey: { addedAt: string } | null;
  shared: { left: number };
  accounts: LinkedAccounts;
  botUsername: string;
  isOwner: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showTelegramOptions, setShowTelegramOptions] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [previewEmailSent, setPreviewEmailSent] = useState(false);
  const [emailLinkToken, setEmailLinkToken] = useState<string | null>(null);

  async function openEmailForm() {
    setShowEmailForm((v) => !v);
    if (emailLinkToken) return;
    const response = await fetch('/api/link/email-token', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.token) setEmailLinkToken(body.token);
    else setError(body.error || 'Email linking is not available here.');
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) setMessage(`${q.get('connected')} connected.`);
    if (q.get('error')) setError(q.get('error') || '');
    if (demo && q.get('preview') === 'email-sent') {
      setPreviewEmailSent(true);
      setShowEmailForm(true);
      setEmailLinkToken('preview');
    }
  }, [demo]);

  function reset() {
    setError('');
    setMessage('');
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

      <GeminiKeyCard initial={geminiKey} />

      <Group
        title="AI today"
        footer={geminiKey
          ? 'Running on your own Gemini key.'
          : `Jobber shares one free Gemini quota between everyone (${shared.left} requests left today across all users). Limits reset at 09:00 Vienna time.`}
      >
        <Row icon={Gauge} label="Scoring" detail={`Each request scores up to 5 pre-filtered jobs`} trailing={<span className="text-[13px] tabular-nums text-muted">{usage.used.score} / {usage.limits.score}</span>} />
        <Row icon={PenLine} label="Letters & CV advice" trailing={<span className="text-[13px] tabular-nums text-muted">{usage.used.write} / {usage.limits.write}</span>} />
      </Group>

      <Group title="Appearance" footer="System follows your device on the web and your Telegram theme in the app.">
        <div className="p-3"><ThemeSegmented /></div>
      </Group>

      <InstallGroup />

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
              <Button size="sm" variant="soft" onClick={openEmailForm}>Link</Button>
            )
          }
        />
        {!accounts.email && showEmailForm && (
          <div className="animate-in p-4">
            {emailLinkToken ? (
              <EmailLinkForm
                redirectTo={`/auth/callback?link=email&t=${encodeURIComponent(emailLinkToken)}`}
                submitLabel="Send link"
                initialState={previewEmailSent ? { kind: 'sent', email: 'you@example.com', at: Date.now() - 20000 } : undefined}
              />
            ) : (
              <p className="text-[13px] text-muted">Preparing…</p>
            )}
          </div>
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

/** Only on the web: inside Telegram the app is already "installed". */
function InstallGroup() {
  const [web, setWeb] = useState(false);
  const [force, setForce] = useState<'ios' | 'prompt' | undefined>();
  useEffect(() => {
    setWeb(!insideTelegram());
    const p = new URLSearchParams(window.location.search).get('install');
    if (p === 'ios' || p === 'prompt') setForce(p);
  }, []);
  if (!web) return null;
  return (
    <Group title="App">
      <InstallApp force={force} />
    </Group>
  );
}
