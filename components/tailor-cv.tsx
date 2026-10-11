'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { capsClass } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';
import type { CvAdvice } from '@/lib/ai/cv-advice';

function List({ title, items, tone = 'accent' }: { title: string; items: string[]; tone?: 'accent' | 'warning' | 'muted' }) {
  if (!items.length) return null;
  const dot = tone === 'accent' ? 'bg-accent' : tone === 'warning' ? 'bg-warning' : 'bg-subtle';
  return (
    <div>
      <p className={cn(capsClass, 'mb-2')}>{title}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug">
            <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', dot)} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Tailor CV": AI compares the CV with this job. Results are cached server-side per match. */
export function TailorCv({ matchId, initialAdvice, initialCv }: { matchId: string; initialAdvice: CvAdvice | null; initialCv: string | null }) {
  const [advice, setAdvice] = useState(initialAdvice);
  const [cv, setCv] = useState(initialCv || '');
  const [loading, setLoading] = useState<'advice' | 'cv' | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function run(kind: 'advice' | 'cv', refresh = false) {
    setLoading(kind);
    setError('');
    const res = await fetch(`/api/matches/${matchId}/advice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refresh }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setLoading(null);
    if (!res?.ok) {
      setError(body.error || 'Something went wrong. Try again.');
      haptic('error');
      return;
    }
    if (kind === 'advice') setAdvice(body.advice);
    else setCv(body.tailoredCv || '');
    haptic('success');
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <p className="text-[14px] font-medium">Tailor CV</p>
        {advice && (
          <Button size="sm" variant="ghost" onClick={() => run('advice', true)} disabled={loading !== null} aria-label="Refresh advice">
            <RefreshCw className={cn(loading === 'advice' && 'animate-spin')} />
          </Button>
        )}
      </div>

      {!advice ? (
        <div className="px-5 py-6">
          <p className="text-[14px] leading-relaxed text-muted">
            Compare your CV with this job: what to put first, what to reword in their language, which keywords are missing — and what not to claim.
          </p>
          <Button className="mt-4" variant="accent" onClick={() => run('advice')} disabled={loading !== null}>
            {loading === 'advice' ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {loading === 'advice' ? 'Comparing…' : 'Get CV advice'}
          </Button>
        </div>
      ) : (
        <div className="animate-in space-y-5 px-5 py-5">
          {advice.verdict && <p className="text-[15px] font-medium leading-snug tracking-[-0.01em]">{advice.verdict}</p>}
          <List title="Put first" items={advice.emphasize} />
          <List title="Bring up from your CV" items={advice.add} />
          {advice.reword.length > 0 && (
            <div>
              <p className={cn(capsClass, 'mb-2')}>Reword</p>
              <div className="space-y-2.5">
                {advice.reword.map((r, i) => (
                  <div key={i} className="rounded-[var(--radius-field)] bg-surface-2 px-3.5 py-2.5 text-[13.5px] leading-snug">
                    {r.from && <p className="text-muted line-through decoration-subtle/60">{r.from}</p>}
                    <p className={cn(r.from && 'mt-1')}>{r.to}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {advice.missingKeywords.length > 0 && (
            <div>
              <p className={cn(capsClass, 'mb-2')}>Keywords they use</p>
              <div className="flex flex-wrap gap-1.5">
                {advice.missingKeywords.map((k) => <span key={k} className="rounded-full border border-line px-2.5 py-0.5 text-[12.5px]">{k}</span>)}
              </div>
              <p className="mt-1.5 text-[12px] text-subtle">Only add the ones you actually have.</p>
            </div>
          )}
          <List title="Don’t claim" items={advice.doNotClaim} tone="warning" />

          <div className="border-t border-line pt-4">
            {cv ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className={capsClass}>Tailored CV text</p>
                  <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(cv); setCopied(true); }}>
                    {copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-field)] bg-surface-2 p-3.5 font-sans text-[13px] leading-relaxed">{cv}</pre>
              </div>
            ) : (
              <Button variant="soft" onClick={() => run('cv')} disabled={loading !== null}>
                {loading === 'cv' ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {loading === 'cv' ? 'Writing…' : 'Generate tailored CV text'}
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p className="border-t border-line px-5 py-3 text-[13px] text-danger">{error}</p>}
    </section>
  );
}
