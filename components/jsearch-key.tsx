'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, fieldClass } from '@/components/ui/kit';
import { haptic, openExternal } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';

export interface JSearchState {
  key: { addedAt: string } | null;
  active: boolean;
  fromEnv: boolean;
  usage: { used: number; limit: number };
}

const SIGNUP = { openwebninja: 'https://www.openwebninja.com/api/jsearch', rapidapi: 'https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch' } as const;

/** LinkedIn, Indeed & co. through JSearch (Google for Jobs), on the user's own free key. */
export function JSearchKeyCard({ initial }: { initial: JSearchState }) {
  const [state, setState] = useState(initial);
  const [host, setHost] = useState<'openwebninja' | 'rapidapi'>('openwebninja');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function call(method: 'POST' | 'DELETE') {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/keys/jsearch', { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ host, key }) : undefined }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { haptic('error'); setMsg({ tone: 'danger', text: data.error || 'Could not save. Try again.' }); return; }
    haptic('success');
    setState(data);
    setKey('');
    setMsg({ tone: 'success', text: method === 'POST' ? 'Saved. LinkedIn and Indeed jobs come in with the next search.' : 'Removed.' });
  }

  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-line p-5">
      <div>
        <p className="text-[15px] font-semibold">LinkedIn, Indeed & more</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Jobs from LinkedIn, Indeed, Glassdoor, StepStone and company sites, as Google for Jobs lists them, through JSearch. The free plan gives about 200 searches a month; Jobber uses at most {state.usage.limit}, two keywords once a day.
        </p>
      </div>
      {state.active ? (
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-muted">
            {state.fromEnv ? 'On (server key)' : 'On (your key)'} · <span className="tabular-nums text-fg">{state.usage.used}/{state.usage.limit}</span> this month
          </span>
          {state.key && (
            <Button size="sm" variant="ghost" onClick={() => call('DELETE')} disabled={busy}><Trash2 />Remove</Button>
          )}
        </div>
      ) : null}
      {!state.key && (
        <div className="space-y-2">
          <div className="flex gap-1.5 text-[12.5px]">
            {(['openwebninja', 'rapidapi'] as const).map((h) => (
              <button key={h} type="button" onClick={() => setHost(h)} className={cn('rounded-full border px-3 py-1', host === h ? 'border-fg font-medium' : 'border-line text-muted')}>
                {h === 'openwebninja' ? 'OpenWeb Ninja' : 'RapidAPI'}
              </button>
            ))}
            <button type="button" onClick={() => void openExternal(SIGNUP[host])} className="ml-auto inline-flex items-center gap-1 text-accent">Get a free key <ExternalLink className="size-3" /></button>
          </div>
          <div className="flex gap-2">
            <input className={cn(fieldClass, 'h-10 flex-1 font-mono text-[13px]')} value={key} placeholder="Paste your JSearch API key" onChange={(e) => setKey(e.target.value)} autoComplete="off" />
            <Button onClick={() => call('POST')} disabled={busy || key.trim().length < 20}>{busy ? <Loader2 className="animate-spin" /> : null}Save</Button>
          </div>
          <p className="text-[11.5px] text-subtle">Stored encrypted. Only used for your own searches.</p>
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </section>
  );
}
