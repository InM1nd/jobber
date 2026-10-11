'use client';

import { useState } from 'react';
import { Check, ChevronDown, ClipboardPaste, ExternalLink, KeyRound, Loader2, MousePointerClick, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, fieldClass } from '@/components/ui/kit';
import { haptic, openExternal } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';

const STUDIO = 'https://aistudio.google.com/app/apikey';

/** Little drawn "screens" so non-technical people know what they'll see. */
function Mock({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 overflow-hidden rounded-[10px] border border-line bg-surface-2">
      <div className="flex items-center gap-1 border-b border-line px-2.5 py-1.5">
        {[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-line-strong" />)}
        <span className="ml-2 truncate text-[10px] text-subtle">aistudio.google.com</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const STEPS: Array<{ title: string; text: string; mock: React.ReactNode }> = [
  {
    title: 'Open Google AI Studio',
    text: 'Tap the button below and sign in with any Google (Gmail) account. It’s free — no card needed.',
    mock: (
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-bg text-[11px] font-bold">G</span>
        <span className="h-2 w-24 rounded bg-line-strong" />
        <span className="ml-auto rounded-full bg-[#1a73e8] px-2.5 py-1 text-[10px] font-medium text-white">Sign in</span>
      </div>
    ),
  },
  {
    title: 'Press “Create API key”',
    text: 'On the “API keys” page, press the blue button. If it asks for a project, pick the suggested one.',
    mock: (
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">API keys</span>
        <span className="relative inline-flex items-center gap-1 rounded-full bg-[#1a73e8] px-2.5 py-1 text-[10px] font-medium text-white">
          <Plus className="size-3" /> Create API key
          <MousePointerClick className="absolute -bottom-3 -right-3 size-4 text-fg" />
        </span>
      </div>
    ),
  },
  {
    title: 'Copy the key',
    text: 'A long code appears, starting with “AIza…”. Press the copy icon next to it.',
    mock: (
      <div className="flex items-center gap-2 rounded-md border border-line bg-bg px-2 py-1.5">
        <span className="font-mono text-[10.5px] text-muted">AIzaSy••••••••••••••••Q4</span>
        <span className="ml-auto rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">Copy</span>
      </div>
    ),
  },
  {
    title: 'Paste it here',
    text: 'Come back to Jobber and paste it in the box below. That’s it — your AI now has its own free daily quota.',
    mock: (
      <div className="flex items-center gap-2 rounded-md border border-accent bg-bg px-2 py-1.5">
        <ClipboardPaste className="size-3.5 text-accent" />
        <span className="font-mono text-[10.5px] text-muted">AIzaSy…</span>
        <span className="ml-auto rounded bg-fg px-1.5 py-0.5 text-[10px] font-medium text-bg">Save</span>
      </div>
    ),
  },
];

export function GeminiKeyCard({ initial }: { initial: { addedAt: string } | null }) {
  const [info, setInfo] = useState(initial);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setError(data.error || 'Could not save the key.');
      haptic('error');
      return;
    }
    haptic('success');
    setKey('');
    setInfo(data.key);
    setOpen(false);
  }

  async function remove() {
    await fetch('/api/keys', { method: 'DELETE' });
    setInfo(null);
  }

  return (
    <section className="space-y-2">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line">
        <div className="flex items-center gap-3.5 px-5 py-4">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', info ? 'bg-accent text-accent-fg' : 'bg-accent-soft text-accent')}>
            {info ? <Check className="size-5" /> : <KeyRound className="size-[18px]" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-semibold tracking-[-0.01em]">{info ? 'Your own Gemini key is on' : 'Use your own free Gemini key'}</p>
            <p className="text-[12.5px] leading-snug text-muted">
              {info ? `Added ${new Date(info.addedAt).toLocaleDateString()}. Stored encrypted. Your limits are much higher.` : 'Optional. Takes 2 minutes and gives you far more AI scoring per day.'}
            </p>
          </div>
          {info && (
            <button type="button" onClick={remove} aria-label="Remove key" className="flex size-9 items-center justify-center rounded-full text-subtle hover:bg-surface-2 hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
        {!info && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between border-t border-line px-5 py-3 text-[14px] font-medium text-accent">
            How to get a free Gemini key
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
        {open && !info && (
          <div className="animate-in space-y-5 border-t border-line px-5 py-5">
            <ol className="space-y-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fg text-[13px] font-semibold text-bg">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{s.title}</p>
                    <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">{s.text}</p>
                    <Mock>{s.mock}</Mock>
                  </div>
                </li>
              ))}
            </ol>
            <Button variant="outline" className="w-full" onClick={() => void openExternal(STUDIO)}>
              Open Google AI Studio <ExternalLink />
            </Button>
            <form onSubmit={save} className="space-y-2">
              <input
                className={cn(fieldClass, 'font-mono')}
                placeholder="Paste your key (AIza…)"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {error && <Notice tone="danger">{error}</Notice>}
              <Button type="submit" className="w-full" disabled={busy || key.trim().length < 30}>
                {busy ? <Loader2 className="animate-spin" /> : null} Check & save key
              </Button>
            </form>
            <p className="text-[12px] leading-relaxed text-subtle">Google’s free tier is enough for Jobber. The key is encrypted and only used for your own searches. You can remove it any time.</p>
          </div>
        )}
      </div>
    </section>
  );
}
