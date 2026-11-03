'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, ChevronDown, Clock, PartyPopper, RotateCcw, X } from 'lucide-react';
import { EmptyState, FIT_LABEL, FIT_TEXT, Note, ScoreRing, fitOf } from '@/components/ui/kit';
import { RequirementsList } from '@/components/app/requirements-list';
import { haptic } from '@/components/telegram-ui';
import { SKIP_REASONS } from '@/lib/tracker/skip';
import { formatSalaryRange } from '@/lib/text';
import { cn } from '@/lib/utils';
import type { DeckCard } from '@/lib/tracker/deck';
import { AdSection } from '@/components/app/ad-sections';

type Decision = 'apply' | 'skip' | 'later';
const THRESHOLD = 110;
const EXIT_MS = 220;

const place = (c: DeckCard) => [c.job.location, c.job.remote && !/remote/i.test(c.job.location || '') ? 'Remote' : null].filter(Boolean).join(' · ');
const salary = (c: DeckCard) => formatSalaryRange(c.job.salaryMin, c.job.salaryMax, c.job.currency || 'EUR');
const age = (iso: string | null) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
};

async function post(id: string, body: object) {
  const res = await fetch(`/api/matches/${id}/decide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return Boolean(res?.ok);
}

/**
 * Review: one card at a time. Phone: swipe (right apply, left skip, up later) or the buttons.
 * Desktop: drag with the mouse or the keys (→/A apply, ←/S skip, ↑/L later, Z undo, 1-8 skip reason),
 * with the full details beside the card.
 */
export function ReviewDeck({ cards: initial }: { cards: DeckCard[] }) {
  const [cards, setCards] = useState(initial);
  const [i, setI] = useState(0);
  const [history, setHistory] = useState<Array<{ index: number; decision: Decision; id: string }>>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exit, setExit] = useState<Decision | null>(null);
  const [askWhy, setAskWhy] = useState<{ id: string; reason?: string } | null>(null);
  const [details, setDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const busy = useRef(false);

  useEffect(() => setCards(initial), [initial]);
  const card = cards[i];
  const next = cards[i + 1];

  const act = useCallback(
    async (decision: Decision) => {
      if (!card || busy.current) return;
      busy.current = true;
      haptic(decision === 'apply' ? 'success' : 'light');
      setExit(decision);
      setDetails(false);
      const id = card.id;
      const index = i;
      window.setTimeout(() => {
        setI((n) => n + 1);
        setExit(null);
        setDrag({ x: 0, y: 0, active: false });
        busy.current = false;
      }, EXIT_MS);
      setHistory((h) => [...h, { index, decision, id }]);
      setAskWhy(decision === 'skip' ? { id } : null);
      if (decision === 'apply') setApplied((n) => n + 1);
      const ok = await post(id, { decision });
      if (!ok) {
        setError('Couldn’t save that one — it’s back on top.');
        haptic('error');
        setHistory((h) => h.filter((x) => x.id !== id));
        if (decision === 'apply') setApplied((n) => n - 1);
        setI(index);
      }
    },
    [card, i],
  );

  const undoLast = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy.current) return;
    haptic('light');
    setHistory((h) => h.slice(0, -1));
    setAskWhy(null);
    if (last.decision === 'apply') setApplied((n) => n - 1);
    setI(last.index);
    if (!(await post(last.id, { action: 'undo' }))) setError('Couldn’t undo on the server — check Matches.');
  }, [history]);

  const reason = useCallback(async (r: string) => {
    if (!askWhy) return;
    const same = askWhy.reason === r;
    setAskWhy({ ...askWhy, reason: same ? undefined : r });
    haptic('light');
    await post(askWhy.id, { action: 'reason', reason: same ? null : r });
  }, [askWhy]);

  // The reason row stays a few seconds, then gets out of the way.
  useEffect(() => {
    if (!askWhy) return;
    const t = window.setTimeout(() => setAskWhy(null), askWhy.reason ? 1500 : 7000);
    return () => window.clearTimeout(t);
  }, [askWhy]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (askWhy && /^[1-8]$/.test(k)) { e.preventDefault(); void reason(SKIP_REASONS[Number(k) - 1]); return; }
      if (k === 'arrowright' || k === 'a') { e.preventDefault(); void act('apply'); }
      else if (k === 'arrowleft' || k === 's') { e.preventDefault(); void act('skip'); }
      else if (k === 'arrowup' || k === 'l') { e.preventDefault(); void act('later'); }
      else if (k === 'z' || k === 'backspace') { e.preventDefault(); void undoLast(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, undoLast, reason, askWhy]);

  const onDown = (e: React.PointerEvent) => {
    if (busy.current || (e.target as HTMLElement).closest('a,button')) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ x: e.clientX - start.current.x, y: Math.min(0, e.clientY - start.current.y), active: true });
  };
  const onUp = () => {
    if (!start.current) return;
    const { x, y } = drag;
    start.current = null;
    if (x > THRESHOLD) void act('apply');
    else if (x < -THRESHOLD) void act('skip');
    else if (y < -THRESHOLD && Math.abs(x) < THRESHOLD) void act('later');
    else {
      // A tap (no real movement) opens the details on the phone.
      if (Math.abs(x) < 6 && Math.abs(y) < 6) setDetails((d) => !d);
      setDrag({ x: 0, y: 0, active: false });
    }
  };

  const done = i >= cards.length;
  const exitStyle = exit === 'apply' ? 'translate(140%, 0) rotate(18deg)' : exit === 'skip' ? 'translate(-140%, 0) rotate(-18deg)' : exit === 'later' ? 'translate(0, -130%)' : null;
  const transform = exitStyle ?? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`;
  const hint: Decision | null = drag.x > 40 ? 'apply' : drag.x < -40 ? 'skip' : drag.y < -40 ? 'later' : null;

  return (
    <div data-wide className="lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div className="min-w-0">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium tracking-[-0.01em] text-muted">Review</p>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{done ? 'All caught up' : `${i + 1} of ${cards.length}`}</h1>
          </div>
          <button
            type="button"
            onClick={() => void undoLast()}
            disabled={!history.length}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" /> Undo
          </button>
        </div>

        {!done && (
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(i / Math.max(1, cards.length)) * 100}%` }} />
          </div>
        )}

        {done ? (
          <EmptyState
            icon={PartyPopper}
            title={cards.length ? 'Done for today' : 'Nothing to review'}
            text={cards.length
              ? `${applied ? `${applied} sent to the tracker — the letters and apply links are coming to Telegram. ` : ''}New roles arrive after the morning and afternoon runs.`
              : 'New roles are scored every morning and afternoon. Matches has everything, including lower scores.'}
            action={
              <div className="flex gap-2">
                <Link href="/dashboard/tracker" className="inline-flex h-11 items-center rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-fg">Open tracker</Link>
                <Link href="/dashboard/matches" className="inline-flex h-11 items-center rounded-full border border-line px-4 text-[14px] font-medium">All matches</Link>
              </div>
            }
          />
        ) : (
          <>
            <div className="relative h-[min(470px,calc(100dvh-330px))] min-h-[360px] select-none">
              {next && (
                <div className="absolute inset-0 scale-[0.96] rounded-[var(--radius-card)] border border-line bg-surface opacity-70" aria-hidden>
                  <CardBody card={next} />
                </div>
              )}
              <div
                key={card.id}
                role="group"
                aria-label={`${card.job.title} at ${card.job.company}, score ${card.score}`}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className={cn(
                  'absolute inset-0 cursor-grab touch-none overflow-hidden rounded-[var(--radius-card)] border bg-surface shadow-lift active:cursor-grabbing',
                  hint === 'apply' ? 'border-fit-strong' : hint === 'skip' ? 'border-fit-weak' : hint === 'later' ? 'border-accent' : 'border-line',
                )}
                style={{ transform, transition: drag.active && !exit ? 'none' : `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms`, opacity: exit ? 0 : 1 }}
              >
                {hint && (
                  <span className={cn(
                    'absolute right-5 top-5 z-10 rounded-full px-3 py-1 text-[13px] font-bold tracking-normal',
                    hint === 'apply' ? 'bg-fit-strong/15 text-fit-strong' : hint === 'skip' ? 'bg-fit-weak/15 text-fit-weak' : 'bg-accent/15 text-fg',
                  )}>
                    {hint === 'apply' ? 'Apply' : hint === 'skip' ? 'Not for me' : 'Later'}
                  </span>
                )}
                <CardBody card={card} />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4">
              <RoundButton label="Not for me" kbd="←" onClick={() => void act('skip')} className="text-fit-weak"><X className="size-6" /></RoundButton>
              <RoundButton label="Later" kbd="↑" onClick={() => void act('later')} small><Clock className="size-5" /></RoundButton>
              <RoundButton label="Apply" kbd="→" onClick={() => void act('apply')} className="bg-accent text-accent-fg border-accent"><Check className="size-6" /></RoundButton>
            </div>

            <button type="button" onClick={() => setDetails((d) => !d)} className="mx-auto mt-3 flex items-center gap-1 text-[13px] font-medium text-muted lg:hidden">
              {details ? 'Hide details' : 'Details'} <ChevronDown className={cn('size-4 transition-transform', details && 'rotate-180')} />
            </button>
            <p className="mt-4 hidden text-center text-[13px] text-muted lg:block">
              <Kbd>→</Kbd> apply · <Kbd>←</Kbd> not for me · <Kbd>↑</Kbd> later · <Kbd>Z</Kbd> undo
            </p>
          </>
        )}

        {askWhy && (
          <div className="fixed inset-x-4 bottom-[calc(96px+var(--safe-bottom))] z-40 mx-auto max-w-md animate-in rounded-2xl border border-line bg-bg p-3 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.3)] md:bottom-8">
            <p className="mb-2 px-1 text-[13.5px] text-muted">Why not? <span className="text-muted">(optional — teaches the scoring)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {SKIP_REASONS.map((r, n) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => void reason(r)}
                  className={cn('h-8 rounded-full border px-3 text-[13.5px] font-medium', askWhy.reason === r ? 'border-accent bg-accent/10' : 'border-line text-muted hover:bg-surface-2')}
                >
                  <span className="mr-1 hidden text-muted lg:inline">{n + 1}</span>{r}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="fixed inset-x-4 top-[calc(16px+var(--safe-top))] z-50 mx-auto max-w-md rounded-xl bg-fg px-4 py-2.5 text-center text-[13px] text-bg">{error}</p>
        )}

        {!done && details && <div className="mt-5 space-y-4 lg:hidden"><Details card={card} /></div>}
      </div>

      {!done && card && (
        <aside className="hidden space-y-4 lg:block">
          <Details card={card} />
        </aside>
      )}
    </div>
  );
}

/** The card's "what is this job": the scorer's gist, else the first lines of "What you'd do". */
function summaryOf(card: DeckCard): string[] {
  if (card.gist.length) return card.gist.slice(0, 3);
  const task = card.job.sections.find((s) => s.kind === 'task') || card.job.sections.find((s) => s.kind !== 'about');
  return (task?.items || []).slice(0, 3).map((t) => (t.length > 110 ? `${t.slice(0, 107).trimEnd()}…` : t));
}

function CardBody({ card }: { card: DeckCard }) {
  const fit = fitOf(card.score);
  const facts = [place(card), salary(card), age(card.job.postedAt)].filter(Boolean);
  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[14px] text-muted">{card.job.company}</p>
          <h2 className="mt-1 line-clamp-3 text-[24px] font-semibold leading-[1.1] tracking-[-0.03em]">{card.job.title}</h2>
        </div>
        <ScoreRing score={card.score} size={54} />
      </div>
      <p className="mt-3 text-[13.5px] text-muted">
        <span className={cn('font-semibold', FIT_TEXT[fit])}>{FIT_LABEL[fit]}</span>
        {facts.map((f) => <span key={f}> · {f}</span>)}
      </p>
      {(card.agent || card.verified) && (
        <p className="mt-1 text-[13px] text-muted">
          {card.agent ? `Found by ${card.agent.by.charAt(0).toUpperCase() + card.agent.by.slice(1)}` : ''}
          {card.agent && card.verified ? ' · ' : ''}
          {card.verified ? 'Double-checked' : ''}
        </p>
      )}

      {summaryOf(card).length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {summaryOf(card).map((s) => (
            <li key={s} className="flex gap-2 text-[14px] leading-snug text-fg/85">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-subtle" />
              <span className="line-clamp-2">{s}</span>
            </li>
          ))}
        </ul>
      )}

      {card.requirements.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {card.requirements.slice(0, 5).map((r) => (
            <li key={r.text} className={cn(
              'rounded-full px-2.5 py-1 text-[13.5px]',
              r.result === 'covered' ? 'bg-fit-strong/10 text-fg' : r.result === 'partial' ? 'bg-fit-ok/15 text-fg' : 'bg-fit-weak/10 text-fg',
            )}>
              {r.result === 'covered' ? '✓' : r.result === 'partial' ? '~' : '✗'} {r.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto space-y-2 pt-5">
        {card.reasons[0] && <p className="text-[14px] leading-snug"><span className="text-fit-strong">+</span> {card.reasons[0]}</p>}
        {card.reasons[1] && <p className="text-[14px] leading-snug"><span className="text-fit-strong">+</span> {card.reasons[1]}</p>}
        {card.redFlags[0] && <p className="text-[14px] leading-snug text-muted"><span className="text-fit-weak">−</span> {card.redFlags[0]}</p>}
      </div>
    </div>
  );
}

function Details({ card }: { card: DeckCard }) {
  const name = card.agent ? card.agent.by.charAt(0).toUpperCase() + card.agent.by.slice(1) : '';
  return (
    <>
      <div className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{card.job.company}</p>
          <p className="text-[17px] font-semibold leading-snug tracking-[-0.02em]">{card.job.title}</p>
        </div>
        {card.job.url && (
          <a href={card.job.url} target="_blank" rel="noreferrer" className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold">
            Listing <ArrowUpRight className="size-4 text-accent" />
          </a>
        )}
      </div>
      {(card.reasons.length > 0 || card.redFlags.length > 0) && (
        <section className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4">
          <p className="mb-2.5 text-[14px] font-medium">Why {card.score}</p>
          <ul className="space-y-2">
            {card.reasons.map((r) => (
              <li key={r} className="flex gap-2.5 text-[14px] leading-snug"><span className="font-semibold text-fit-strong">+</span><span>{r}</span></li>
            ))}
            {card.redFlags.map((r) => (
              <li key={r} className="flex gap-2.5 text-[14px] leading-snug text-muted"><span className="font-semibold text-fit-weak">−</span><span>{r}</span></li>
            ))}
          </ul>
        </section>
      )}
      {card.agent?.note && (
        <section className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4">
          <p className="mb-1.5 text-[14px] font-medium">{name}&rsquo;s note{card.agent.score !== undefined && <span className="font-normal text-muted"> · its guess {card.agent.score}</span>}</p>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted">{card.agent.note}</p>
        </section>
      )}
      <RequirementsList items={card.requirements} />
      {card.job.sections.map((s) => <AdSection key={`${card.id}-${s.kind}-${s.title}`} section={s} />)}
    </>
  );
}


function RoundButton({ label, kbd, onClick, className, small, children }: { label: string; kbd: string; onClick: () => void; className?: string; small?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} (${kbd})`}
      title={`${label} (${kbd})`}
      className={cn(
        'flex items-center justify-center rounded-full border border-line bg-bg shadow-soft transition-transform hover:scale-105 active:scale-95',
        small ? 'size-12 text-muted' : 'size-16',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[13px] text-muted">{children}</kbd>;
}
