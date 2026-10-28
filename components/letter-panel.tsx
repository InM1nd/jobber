'use client';

import { useState } from 'react';
import { History, Loader2, Pencil, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { haptic } from '@/components/telegram-ui';
import { CheckFacts, Note, fieldClass } from '@/components/ui/kit';
import { splitLetter } from '@/lib/apply/letter';
import { isStale, type LetterVersion, type OutputMeta } from '@/lib/ai/meta';
import { cn } from '@/lib/utils';

const CAUSE: Record<string, string> = {
  generated: 'Written', rewritten: 'Rewritten', paragraph: 'Paragraph rewritten', edited: 'Your edit', restored: 'Restored', claude: 'Written with Claude',
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

type Busy = '' | 'write' | 'refine' | 'save' | `p${number}` | `r${number}`;

export function LetterPanel({
  matchId,
  initial,
  initialMeta,
  initialHistory = [],
  chips = [],
  claudeUrl,
}: {
  matchId: string;
  initial: string | null;
  initialMeta?: OutputMeta | null;
  initialHistory?: LetterVersion[];
  /** Refine suggestions built from the match. */
  chips?: string[];
  /** "Write it with Claude" link, when the Claude connector is set up. */
  claudeUrl?: string | null;
}) {
  const [letter, setLetter] = useState(initial || '');
  const [meta, setMeta] = useState<OutputMeta | null>(initialMeta || null);
  const [history, setHistory] = useState<LetterVersion[]>(initialHistory);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Busy>('');
  const [copied, setCopied] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [instruction, setInstruction] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const stale = isStale('letter', meta, Boolean(letter));
  const { paragraphs, signOff } = splitLetter(letter);

  async function call(method: 'POST' | 'PUT', body: object, mark: Busy) {
    setBusy(mark);
    setError('');
    const response = await fetch(`/api/matches/${matchId}/letter`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setBusy('');
    if (!response?.ok) {
      setError(data.error || 'Could not update the letter');
      haptic('error');
      return false;
    }
    setLetter(data.letter || '');
    setMeta(data.meta || null);
    setHistory(data.history || []);
    setCopied(false);
    haptic('success');
    return true;
  }

  const write = () => call('POST', { mode: 'write' }, 'write');
  const refine = async (text: string) => { if (await call('POST', { mode: 'refine', instruction: text }, 'refine')) setInstruction(''); };
  const rewriteParagraph = async (i: number) => {
    if (await call('POST', { mode: 'paragraph', paragraph: i, instruction: instruction.trim() || undefined }, `p${i}`)) { setPicked(null); setInstruction(''); }
  };
  const restore = async (i: number) => { if (await call('PUT', { restore: i }, `r${i}`)) setShowHistory(false); };
  const saveEdit = async () => { if (await call('PUT', { text: draft }, 'save')) setEditing(false); };

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <p className="text-[14px] font-medium">Cover letter</p>
        <div className="flex gap-1.5">
          {letter && !editing && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(letter); setCopied(true); }}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button type="button" size="sm" variant="ghost" aria-label="Edit" onClick={() => { setDraft(letter); setEditing(true); }}>
                <Pencil />
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant={letter ? 'outline' : 'default'} onClick={write} disabled={!!busy}>
            {busy === 'write' ? 'Writing…' : letter ? 'Rewrite' : 'Generate'}
          </Button>
        </div>
      </div>
      {error && <p className="px-4 pt-3 text-[13px] text-danger">{error}</p>}

      {!letter ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[13px] text-muted">No letter yet. It sticks to facts from your CV and profile and follows your writing rules.</p>
          {claudeUrl && (
            <a href={claudeUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[13px] font-medium text-accent">
              Or write it with Claude (uses your Claude plan) →
            </a>
          )}
        </div>
      ) : editing ? (
        <div className="space-y-2 px-4 py-4">
          <textarea className={cn(fieldClass, 'min-h-[260px] text-[14px] leading-[1.6]')} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit} disabled={busy === 'save' || !draft.trim()}>{busy === 'save' ? <Loader2 className="animate-spin" /> : null}Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          {stale && <Note tone="warning">Written with an older prompt. Rewrite to get the current one.</Note>}
          <div className="space-y-1 text-[14px] leading-[1.65]">
            {paragraphs.map((p, i) => (
              <div key={i} className={cn('group -mx-2 rounded-[10px] px-2 py-1.5 transition-colors', picked === i ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                <button type="button" className="w-full whitespace-pre-wrap text-left" onClick={() => setPicked(picked === i ? null : i)}>{p}</button>
                {picked === i && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="soft" onClick={() => rewriteParagraph(i)} disabled={!!busy}>
                      {busy === `p${i}` ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      {instruction.trim() ? 'Rewrite with your note' : 'Rewrite this paragraph'}
                    </Button>
                    <span className="text-[11.5px] text-subtle">The others stay as they are.</span>
                  </div>
                )}
              </div>
            ))}
            {signOff && <p className="whitespace-pre-wrap px-0 pt-2">{signOff}</p>}
          </div>
          <CheckFacts items={meta?.unverified} />

          <div className="space-y-2 border-t border-line pt-3">
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <button key={c} type="button" disabled={!!busy} onClick={() => (picked != null ? setInstruction(c) : refine(c))} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] transition-colors hover:bg-surface-2 disabled:opacity-50">
                    {c}
                  </button>
                ))}
              </div>
            )}
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!instruction.trim()) return; if (picked != null) rewriteParagraph(picked); else refine(instruction); }}>
              <input
                className={cn(fieldClass, 'h-9 flex-1 py-0 text-[13.5px]')}
                value={instruction}
                maxLength={300}
                placeholder={picked != null ? `What to change in paragraph ${picked + 1}…` : 'Tell it what to change…'}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <Button size="sm" type="submit" disabled={!!busy || !instruction.trim()} aria-label="Apply">
                {busy === 'refine' ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </form>
            <p className="text-[11.5px] text-subtle">Tap a paragraph to rewrite only that one. Notes change wording and emphasis, never facts.</p>
          </div>

          {history.length > 0 && (
            <div className="border-t border-line pt-3">
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-fg">
                <History className="size-3.5" /> Earlier versions · {history.length}
              </button>
              {showHistory && (
                <ul className="mt-2 space-y-2">
                  {history.map((h, i) => (
                    <li key={`${h.at}-${i}`} className="rounded-[10px] bg-surface-2 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[12.5px] text-muted">
                          <span className="font-medium text-fg">{CAUSE[h.cause] || 'Version'}</span>{h.detail ? ` · ${h.detail}` : ''} · {when(h.at)}
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => restore(i)} disabled={!!busy}>
                          {busy === `r${i}` ? <Loader2 className="animate-spin" /> : null}Restore
                        </Button>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-subtle">{h.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
