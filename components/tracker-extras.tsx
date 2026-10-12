'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2, MailCheck, RefreshCw, Sparkles } from 'lucide-react';
import { FIT_LABEL, FIT_TEXT, ScoreRing, fieldClass, fitOf } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';
import { followUpPlan } from '@/lib/tracker/followup-plan';
import type { DemoApplication } from '@/lib/demo/store';

const SUB_LABEL: Record<string, string> = { role: 'Role fit', skills: 'Skills', seniority: 'Level', location: 'Location', language: 'Language', salary: 'Salary' };
const bar = (v: number) => (v >= 75 ? 'bg-fit-strong' : v >= 55 ? 'bg-fit-good' : v >= 35 ? 'bg-fit-ok' : 'bg-fit-weak');
const day = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const caps = 'text-[11.5px] font-medium uppercase tracking-[0.12em] text-subtle';

export function FitPanel({ app }: { app: DemoApplication }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const fit = app.fit;

  async function run(opts: { text?: string; refetch?: boolean } = {}) {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/applications/${app.id}/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      haptic('error');
      if (data.code === 'need_text') setPaste(true);
      setError(data.error || `Scoring failed (${res?.status ?? 'network'}).`);
      return;
    }
    haptic('success');
    setPaste(false);
    setText('');
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-[18px] border border-line p-4">
      <div className="flex items-center gap-3">
        {fit ? <ScoreRing score={fit.score} size={48} /> : <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-line-strong text-[13px] text-subtle">—</span>}
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">{fit ? <span className={FIT_TEXT[fitOf(fit.score)]}>{FIT_LABEL[fitOf(fit.score)]}</span> : 'Not scored yet'}</p>
          <p className="truncate text-[12.5px] text-muted">
            {fit ? `${fit.cvLabel ? `Best CV: ${fit.cvLabel}` : 'Scored against your profile'}${fit.scoredAt ? ` · ${day(fit.scoredAt)}` : ''}` : 'Check this role against your profile and CVs'}
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => run()} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accent-fg transition-opacity disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : fit ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {busy ? 'Scoring…' : fit ? 'Re-score' : 'Score fit'}
        </button>
      </div>

      {fit?.subScores && (
        <div className="space-y-1.5">
          {Object.keys(SUB_LABEL).filter((k) => fit.subScores![k] != null).map((k) => (
            <div key={k} className="flex items-center gap-3 text-[12.5px]">
              <span className="w-[64px] shrink-0 text-muted">{SUB_LABEL[k]}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className={cn('absolute inset-y-0 left-0 rounded-full', bar(fit.subScores![k]))} style={{ width: `${fit.subScores![k]}%` }} />
              </span>
              <span className="w-7 text-right tabular-nums text-muted">{fit.subScores![k]}</span>
            </div>
          ))}
        </div>
      )}
      {fit && (fit.reasons.length > 0 || fit.redFlags.length > 0) && (
        <ul className="space-y-1 text-[13px] leading-relaxed">
          {fit.reasons.map((r) => <li key={r} className="flex gap-2"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-fit-strong" />{r}</li>)}
          {fit.redFlags.map((r) => <li key={r} className="flex gap-2 text-muted"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-fit-weak" />{r}</li>)}
        </ul>
      )}
      {fit?.cvAdvice && (fit.cvAdvice.emphasize.length > 0 || fit.cvAdvice.add.length > 0 || fit.cvAdvice.doNotClaim.length > 0) && (
        <div className="space-y-1.5 rounded-[14px] bg-surface-2/70 p-3 text-[13px]">
          <p className={caps}>CV tips</p>
          {fit.cvAdvice.verdict && <p className="leading-relaxed">{fit.cvAdvice.verdict}</p>}
          {fit.cvAdvice.emphasize.map((t) => <p key={t} className="text-muted">↑ {t}</p>)}
          {fit.cvAdvice.add.map((t) => <p key={t} className="text-muted">+ {t}</p>)}
          {fit.cvAdvice.doNotClaim.length > 0 && <p className="text-subtle">Don’t claim: {fit.cvAdvice.doNotClaim.join(', ')}</p>}
        </div>
      )}
      {fit && app.url && (
        <button type="button" disabled={busy} onClick={() => run({ refetch: true })} className="text-[12px] text-subtle hover:text-fg">Fetch the listing again</button>
      )}
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {(paste || (!app.url && !fit)) && (
        <div className="space-y-2">
          <textarea className={fieldClass} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the job description here" />
          <button type="button" disabled={busy || text.trim().length < 200} onClick={() => run({ text })} className="h-9 rounded-full bg-fg px-4 text-[13px] font-semibold text-bg disabled:opacity-40">
            Score pasted text
          </button>
        </div>
      )}
    </section>
  );
}

const CH = [
  { key: 'email', label: 'Email' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'careers', label: 'Careers' },
] as const;

export function FollowUpPanel({ app }: { app: DemoApplication }) {
  const router = useRouter();
  const plan = followUpPlan({ ...app, contact: app.contact ?? null });
  const [channel, setChannel] = useState<(typeof CH)[number]['key']>('email');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'' | 'draft' | 'done'>('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  if (!plan.active && plan.count === 0) return null;

  async function call(action: 'draft' | 'done') {
    setBusy(action);
    setError('');
    const res = await fetch(`/api/applications/${app.id}/followup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, channel }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy('');
    if (!res?.ok) {
      haptic('error');
      setError(data.error || 'Something went wrong. Try again.');
      return;
    }
    haptic('success');
    if (action === 'draft') setDraft(data.draft || '');
    else router.refresh();
  }

  return (
    <section className="space-y-3 rounded-[18px] border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14.5px] font-semibold">Follow-up</p>
          <p className="text-[13px] leading-relaxed text-muted">{plan.stage}</p>
        </div>
        {plan.due && plan.active && plan.count < 2 && (
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums', plan.overdue ? 'bg-fit-weak/12 text-fit-weak' : 'bg-surface-2 text-muted')}>
            {plan.overdue ? 'Due ' : ''}{day(plan.due)}
          </span>
        )}
      </div>
      {plan.timeline.length > 0 && (
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-subtle">
          {plan.timeline.map((t, i) => <li key={t} className={cn(i === Math.min(plan.count + 1, 3) && 'font-semibold text-fg')}>{t}</li>)}
        </ol>
      )}
      <div className="inline-flex rounded-full bg-surface-2 p-0.5 text-[12.5px] font-medium">
        {CH.map((c) => (
          <button key={c.key} type="button" onClick={() => setChannel(c.key)} className={cn('h-7 rounded-full px-3', channel === c.key ? 'bg-bg text-fg shadow-soft' : 'text-muted')}>{c.label}</button>
        ))}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">{plan.channels.find((c) => c.label.toLowerCase().startsWith(channel === 'careers' ? 'careers' : channel === 'linkedin' ? 'linkedin' : 'email'))?.detail}</p>
      {draft ? (
        <div className="space-y-2">
          <textarea className={cn(fieldClass, 'text-[13.5px] leading-relaxed')} rows={9} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={async () => { await navigator.clipboard?.writeText(draft).catch(() => {}); setCopied(true); haptic('light'); setTimeout(() => setCopied(false), 1500); }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[13px] font-semibold text-bg">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => call('draft')} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted hover:text-fg">
              <RefreshCw className="size-3.5" /> Rewrite
            </button>
          </div>
          <p className="text-[11.5px] text-subtle">Nothing is sent automatically. Copy it and send it yourself.</p>
        </div>
      ) : (
        <button type="button" disabled={!!busy} onClick={() => call('draft')} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-semibold transition-colors hover:bg-surface-2 disabled:opacity-60">
          {busy === 'draft' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-accent" />} Draft follow-up
        </button>
      )}
      {plan.active && (
        <button type="button" disabled={!!busy} onClick={() => call('done')} className="flex w-full items-center justify-center gap-1.5 rounded-full bg-accent-soft py-2.5 text-[13px] font-semibold text-accent disabled:opacity-60">
          {busy === 'done' ? <Loader2 className="size-3.5 animate-spin" /> : <MailCheck className="size-4" />} Mark followed up
        </button>
      )}
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </section>
  );
}
