'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, capsClass } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { SearchProgress, type RunView } from '@/components/search-progress';
import { CvManager, type CvItem } from '@/components/cv-manager';
import { CompaniesWatch, keyOf, type CompanyOption } from '@/components/companies-watch';
import { SECTIONS, SECTION_COPY, type Section } from '@/components/profile-form';
import { cn } from '@/lib/utils';
import { DraftSchema, draftFromCvs, type Draft } from '@/lib/profile/draft';
import type { CvProfile } from '@/lib/ai/cv-profile';

const FORM: Section[] = ['work', 'where', 'languages', 'level', 'type', 'avoid'];
type Step = 'cvs' | Section | 'planning' | 'companies' | 'searching';
const ORDER: Step[] = ['cvs', ...FORM, 'companies', 'searching'];

interface Plan {
  titles: string[];
  keywords: string[];
  companies: CompanyOption[];
  aiPicked: boolean;
}

function StepDots({ step }: { step: Step }) {
  const at = step === 'planning' ? ORDER.indexOf('companies') : ORDER.indexOf(step);
  return (
    <div className="mb-8 flex items-center gap-1" aria-hidden>
      {ORDER.map((s, i) => (
        <span key={s} className={cn('h-1 rounded-full transition-all duration-300', i <= at ? 'w-5 bg-accent' : 'w-2.5 bg-line')} />
      ))}
    </div>
  );
}

function Title({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.04em]">{children}</h1>
      {hint && <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function Onboarding({ firstName, initialStep }: { firstName?: string | null; initialStep?: Step }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep || 'cvs');
  const [cvs, setCvs] = useState<CvItem[]>([]);
  const [draft, setDraft] = useState<Draft>(() => DraftSchema.parse({ openTo: ['city', 'country', 'remote'], employmentTypes: ['full_time'] }));
  const [touched, setTouched] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<CompanyOption[]>([]);
  const [run, setRun] = useState<RunView | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/cvs').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.cvs?.length) return;
      setCvs(d.cvs);
      const parsed = d.cvs.map((c: CvItem) => c.parsed).filter(Boolean) as CvProfile[];
      if (parsed.length) setDraft(draftFromCvs(parsed));
    });
  }, []);

  /** CVs prefill the form until the user edits it; after that the form wins. */
  function onCvs(next: CvItem[]) {
    setCvs(next);
    const parsed = next.map((c) => c.parsed).filter(Boolean) as CvProfile[];
    if (!touched && parsed.length) setDraft(draftFromCvs(parsed));
  }
  const set = (patch: Partial<Draft>) => {
    setTouched(true);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const go = (s: Step) => {
    setError('');
    setStep(s);
    window.scrollTo({ top: 0 });
  };
  const next = () => {
    const i = ORDER.indexOf(step);
    if (step === 'avoid') return void makePlan();
    go(ORDER[i + 1]);
  };
  const back = () => go(ORDER[Math.max(0, ORDER.indexOf(step) - 1)]);

  async function makePlan() {
    setStep('planning');
    const res = await fetch('/api/onboarding/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(data.error || 'Could not plan the search. Try again.');
      setStep('avoid');
      return;
    }
    setPlan(data);
    if (!draft.keywords.length) setDraft((d) => ({ ...d, keywords: data.keywords }));
    setPicked(new Set(data.companies.filter((c: CompanyOption) => c.suggested).map(keyOf)));
    go('companies');
  }

  async function confirm() {
    setError('');
    const all = [...extra, ...(plan?.companies || [])];
    const companies = all.filter((c) => picked.has(keyOf(c))).map(({ name, ats, slug, cities, countries }) => ({ name, ats, slug, cities, countries }));
    setStep('planning');
    const res = await fetch('/api/onboarding/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: { ...draft, keywords: draft.keywords.length ? draft.keywords : plan?.keywords || [] }, companies }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(data.error || 'Could not start the search.');
      setStep('companies');
      return;
    }
    setRun(data.run);
    go('searching');
  }

  const canNext = useMemo(() => {
    if (step === 'work') return draft.targetRoles.length > 0;
    if (step === 'where') return draft.openTo.length > 0 && (draft.openTo.every((o) => o === 'remote') || Boolean(draft.city || draft.country));
    return true;
  }, [step, draft]);

  const Section = (FORM as Step[]).includes(step) ? SECTIONS[step as Section] : null;
  const options = [...extra, ...(plan?.companies || [])];

  return (
    <div className="mx-auto max-w-lg pb-4">
      <StepDots step={step} />
      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      {step === 'cvs' && (
        <div className="animate-in">
          <Title hint="Jobber reads it and fills in the next questions for you. Have versions for different roles? Add them all — each job gets the best one.">
            {firstName ? `Hi ${firstName}.` : 'Hi.'} Let’s start<br />with your CV.
          </Title>
          <CvManager cvs={cvs} onChange={onCvs} />
          <p className="mt-6 text-center text-[12px] leading-relaxed text-subtle">Your CVs stay in your account and are read by Google Gemini.</p>
          <Footer>
            {cvs.length ? (
              <NextButton onClick={next}>Continue</NextButton>
            ) : (
              <button type="button" onClick={next} className="w-full py-3 text-center text-[14px] text-muted">I don’t have a CV — skip</button>
            )}
          </Footer>
        </div>
      )}

      {Section && (
        <div className="animate-in" key={step}>
          <Title hint={SECTION_COPY[step as Section].hint}>{SECTION_COPY[step as Section].title}</Title>
          <Section draft={draft} set={set} />
          <Footer>
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" className="px-4" onClick={back} aria-label="Back"><ArrowLeft /></Button>
              <NextButton onClick={next} disabled={!canNext}>{step === 'avoid' ? 'Find companies' : 'Next'}</NextButton>
            </div>
          </Footer>
        </div>
      )}

      {step === 'planning' && (
        <div className="animate-in flex flex-col items-center px-6 py-20 text-center">
          <Loader2 className="size-7 animate-spin text-accent" />
          <p className="mt-4 text-[20px] font-semibold tracking-[-0.03em]">Planning your search…</p>
          <p className="mt-1 text-[14px] text-muted">Choosing job boards and companies that fit you.</p>
        </div>
      )}

      {step === 'companies' && plan && (
        <div className="animate-in">
          <Title hint="Tick the ones Jobber should check every day. ✦ = suggested for you. Add any other company by name or careers link.">Companies to watch</Title>
          <CompaniesWatch
            options={options}
            selected={picked}
            onToggle={(c) => setPicked((s) => { const n = new Set(s); n.has(keyOf(c)) ? n.delete(keyOf(c)) : n.add(keyOf(c)); return n; })}
            onAdd={(c) => { setExtra((e) => [c, ...e.filter((x) => keyOf(x) !== keyOf(c))]); setPicked((s) => new Set(s).add(keyOf(c))); }}
          />
          <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-muted">
            Also searched by keyword: {(draft.keywords.length ? draft.keywords : plan.keywords).join(', ')} — on public job boards near you and remote boards.
          </p>
          <Footer>
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" className="px-4" onClick={back} aria-label="Back"><ArrowLeft /></Button>
              <NextButton onClick={confirm}>Find jobs · {picked.size} companies</NextButton>
            </div>
          </Footer>
        </div>
      )}

      {step === 'searching' && run && (
        <div className="animate-in space-y-7">
          <div>
            <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.04em]">{finished ? 'Your first matches are ready' : 'Finding your jobs'}</h1>
            <p className="mt-2 text-[15px] text-muted">{finished ? 'New jobs are checked every morning. Telegram pings you when something fits.' : 'Takes a minute or two. You can leave — it keeps going.'}</p>
          </div>
          <SearchProgress initial={run} onDone={() => { setFinished(true); haptic('success'); }} />
          {finished && (
            <Button size="lg" className="w-full justify-between pl-7 pr-2" onClick={() => router.push('/dashboard/matches')}>
              See matches
              <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg"><ArrowRight className="size-5" /></span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 mt-8 bg-gradient-to-t from-bg via-bg to-transparent px-5 pb-[calc(16px+var(--safe-bottom))] pt-6">{children}</div>;
}

function NextButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button size="lg" className="w-full flex-1 justify-between pl-7 pr-2" onClick={() => { haptic('light'); onClick(); }} disabled={disabled}>
      {children}
      <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg"><ArrowRight className="size-5" /></span>
    </Button>
  );
}

export const _capsClass = capsClass;
