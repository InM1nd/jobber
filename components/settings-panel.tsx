'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Copy, KeyRound, Mail, Send, Ticket, Trash2 } from 'lucide-react';
import { EmailLinkForm } from '@/components/email-link-form';
import { InstallApp } from '@/components/pwa';
import { ThemeSegmented } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Group, Notice, Row, fieldClass } from '@/components/ui/kit';
import { haptic, insideTelegram } from '@/components/telegram-ui';
import { TelegramLoginButton } from '@/components/telegram-login-button';
import type { LinkedAccounts } from '@/lib/data/service';

const PROVIDERS = [
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
  botUsername,
  isOwner,
  demo,
}: {
  keys: { id: string; provider: string; createdAt: string }[];
  accounts: LinkedAccounts;
  botUsername: string;
  isOwner: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);
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

      <Group
        title="AI key"
        footer="Your key pays for scoring and letters. It’s encrypted with AES-256-GCM and never shown again."
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
        {showKeyForm ? (
          <form onSubmit={saveKey} className="animate-in space-y-2.5 p-4">
            <div className="grid grid-cols-4 gap-1 rounded-[8px] bg-surface-2 p-0.5">
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
            <Row icon={KeyRound} label={keys.length ? "Replace API key" : "Add your API key"} detail="OpenAI, Anthropic, Gemini or xAI" trailing={<ChevronRight className="size-4 text-subtle" />} />
          </button>
        )}
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
