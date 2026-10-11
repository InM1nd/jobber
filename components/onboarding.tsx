'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText, Loader2, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Group, Notice, capsClass, fieldClass } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { SearchProgress, type RunView } from '@/components/search-progress';
import { cn } from '@/lib/utils';
import type { CvProfile } from '@/lib/ai/cv-profile';

type Step = 'upload' | 'reading' | 'review' | 'planning' | 'searching';
interface Plan {
  titles: string[];
  keywords: string[];
  companies: { name: string; hq: string; ats: string }[];
  aiPicked: boolean;
}

const SENIORITY = ['junior', 'mid', 'senior', 'lead'] as const;
const REMOTE = [
  ['remote', 'Remote'],
  ['hybrid', 'Hybrid'],
  ['onsite', 'Office'],
  ['any', 'Any'],
] as const;

const splitList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ['upload', 'review', 'searching'];
  const at = step === 'reading' ? 0 : step === 'planning' ? 1 : order.indexOf(step);
  return (
    <div className="mb-8 flex items-center gap-1.5" aria-hidden>
      {order.map((s, i) => (
        <span key={s} className={cn('h-1 rounded-full transition-all duration-300', i <= at ? 'w-6 bg-accent' : 'w-3 bg-line')} />
      ))}
    </div>
  );
}

export function Onboarding({ firstName, preview }: { firstName?: string | null; preview?: { step: Step; profile?: CvProfile; plan?: Plan; run?: RunView } }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(preview?.step || 'upload');
  const [mode, setMode] = useState<'pdf' | 'text'>('pdf');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<CvProfile | null>(preview?.profile || null);
  const [plan, setPlan] = useState<Plan | null>(preview?.plan || null);
  const [run, setRun] = useState<RunView | null>(preview?.run || null);
  const [finished, setFinished] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readCv(body: FormData | string) {
    setError('');
    setStep('reading');
    const res = await fetch('/api/onboarding/cv', {
      method: 'POST',
      ...(typeof body === 'string' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: body }) } : { body }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(data.error || 'Could not read the CV. Try again.');
      setStep('upload');
      haptic('error');
      return;
    }
    setProfile(data.profile);
    setStep('review');
    haptic('success');
  }

  function onFile(file?: File | null) {
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    void readCv(form);
  }

  async function confirm() {
    if (!profile) return;
    setError('');
    setStep('planning');
    const res = await fetch('/api/onboarding/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(data.error || 'Could not start the search.');
      setStep('review');
      return;
    }
    setPlan(data.plan);
    setRun(data.run);
    setStep('searching');
  }

  const set = <K extends keyof CvProfile>(key: K, value: CvProfile[K]) => setProfile((p) => (p ? { ...p, [key]: value } : p));

  return (
    <div className="mx-auto max-w-lg">
      <StepDots step={step} />

      {(step === 'upload' || step === 'reading') && (
        <div className="animate-in">
          <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.04em]">
            {firstName ? `Hi ${firstName}.` : 'Hi.'}<br />Start with your CV.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            That’s all Jobber needs. It reads it, suggests roles and companies, and finds matching jobs — you just check it understood you right.
          </p>

          {error && <div className="mt-6"><Notice tone="danger">{error}</Notice></div>}

          {step === 'reading' ? (
            <div className="mt-8 flex flex-col items-center rounded-[var(--radius-card)] border border-line px-6 py-14 text-center">
              <Loader2 className="size-7 animate-spin text-accent" />
              <p className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">Reading your CV…</p>
              <p className="mt-1 text-[13.5px] text-muted">Pulling out roles, skills and preferences. ~15 seconds.</p>
            </div>
          ) : mode === 'pdf' ? (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFile(e.dataTransfer.files?.[0]);
                }}
                className="mt-8 flex w-full flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-12 text-center transition-colors hover:border-accent hover:bg-surface-2 active:scale-[0.99]"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-fg"><Upload className="size-5" /></span>
                <span className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">Upload CV (PDF)</span>
                <span className="mt-1 text-[13.5px] text-muted">Tap to choose a file · up to 5 MB</span>
              </button>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <button type="button" onClick={() => setMode('text')} className="mt-4 w-full text-center text-[14px] text-accent">
                No PDF? Paste the text instead
              </button>
            </>
          ) : (
            <div className="mt-8 space-y-3">
              <textarea
                className={cn(fieldClass, 'min-h-[260px] resize-y leading-relaxed')}
                placeholder="Paste your CV here — experience, skills, languages, location…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Button size="lg" className="w-full" disabled={text.trim().length < 200} onClick={() => readCv(text)}>
                <FileText /> Read my CV
              </Button>
              <button type="button" onClick={() => setMode('pdf')} className="w-full text-center text-[14px] text-accent">Upload a PDF instead</button>
            </div>
          )}
          <p className="mt-6 text-center text-[12px] leading-relaxed text-subtle">Your CV is stored in your account only and read by Google Gemini to build your profile.</p>
        </div>
      )}

      {step === 'review' && profile && (
        <div className="animate-in space-y-6">
          <div>
            <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.04em]">Here’s what I understood</h1>
            <p className="mt-2 text-[15px] text-muted">Fix anything that’s off — this drives the search.</p>
          </div>
          {error && <Notice tone="danger">{error}</Notice>}

          <div className="rounded-[var(--radius-card)] border border-line bg-bg p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Sparkles className="size-4" /></span>
              <div className="min-w-0">
                <p className="text-[17px] font-semibold tracking-[-0.02em]">{profile.fullName || 'You'}</p>
                {profile.summary && <p className="mt-1 text-[14px] leading-relaxed text-muted">{profile.summary}</p>}
              </div>
            </div>
          </div>

          <Field label="Roles to look for" hint="Comma-separated">
            <input className={fieldClass} value={profile.targetRoles.join(', ')} onChange={(e) => set('targetRoles', splitList(e.target.value))} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Level">
              <select className={fieldClass} value={profile.seniority} onChange={(e) => set('seniority', e.target.value as CvProfile['seniority'])}>
                {SENIORITY.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Years">
              <input className={fieldClass} inputMode="numeric" value={profile.yearsExperience ?? ''} onChange={(e) => set('yearsExperience', e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null)} />
            </Field>
          </div>

          <Field label="Key skills">
            <textarea className={cn(fieldClass, 'min-h-[84px] resize-y')} value={profile.skills.join(', ')} onChange={(e) => set('skills', splitList(e.target.value))} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <input className={fieldClass} value={profile.location || ''} onChange={(e) => set('location', e.target.value || null)} />
            </Field>
            <Field label="Languages">
              <input className={fieldClass} value={profile.languages.join(', ')} onChange={(e) => set('languages', splitList(e.target.value))} />
            </Field>
          </div>

          <Field label="Work setup">
            <div className="grid grid-cols-4 gap-1 rounded-full bg-surface-2 p-1">
              {REMOTE.map(([id, name]) => (
                <button key={id} type="button" onClick={() => set('remotePreference', id)}
                  className={cn('rounded-full py-2 text-[13px] font-medium transition-all', profile.remotePreference === id ? 'bg-bg text-fg shadow-sm' : 'text-muted')}>
                  {name}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Salary (gross €/year, a guess)">
            <div className="grid grid-cols-2 gap-3">
              <input className={fieldClass} inputMode="numeric" placeholder="From" value={profile.salaryMin ?? ''} onChange={(e) => set('salaryMin', Number(e.target.value.replace(/\D/g, '')) || null)} />
              <input className={fieldClass} inputMode="numeric" placeholder="To" value={profile.salaryMax ?? ''} onChange={(e) => set('salaryMax', Number(e.target.value.replace(/\D/g, '')) || null)} />
            </div>
          </Field>

          {profile.gaps.length > 0 && (
            <Group title="Gaps I noticed" footer="Jobber won’t claim these in letters or CV advice.">
              {profile.gaps.map((g, i) => (
                <div key={i} className="flex items-start gap-2.5 px-5 py-3 text-[14px] leading-snug">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warning" />{g}
                </div>
              ))}
            </Group>
          )}

          <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-bg via-bg to-transparent px-5 pb-[calc(16px+var(--safe-bottom))] pt-6">
            <Button size="lg" className="w-full justify-between pl-7 pr-2" onClick={confirm} disabled={!profile.targetRoles.length}>
              Looks right — find jobs
              <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg"><ArrowRight className="size-5" /></span>
            </Button>
          </div>
        </div>
      )}

      {step === 'planning' && (
        <div className="animate-in flex flex-col items-center px-6 py-20 text-center">
          <Loader2 className="size-7 animate-spin text-accent" />
          <p className="mt-4 text-[20px] font-semibold tracking-[-0.03em]">Planning your search…</p>
          <p className="mt-1 text-[14px] text-muted">Picking job titles, keywords and companies that fit.</p>
        </div>
      )}

      {step === 'searching' && plan && run && (
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
          <section>
            <h2 className={cn(capsClass, 'mb-2.5 px-1')}>Searching for</h2>
            <div className="flex flex-wrap gap-1.5">
              {[...plan.titles, ...plan.keywords.filter((k) => !plan.titles.some((t) => t.toLowerCase() === k))].map((t) => (
                <span key={t} className="rounded-full border border-line px-3 py-1 text-[13px]">{t}</span>
              ))}
            </div>
          </section>
          <Group title={`Companies to watch · ${plan.companies.length}`} footer={`Each one has a verified public job board. ${plan.aiPicked ? 'Picked by AI from Jobber’s curated list.' : 'Ranked by stack and location.'} Plus Remotive, Jobicy, Himalayas and Arbeitnow by keyword.`}>
            {plan.companies.map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="truncate text-[15px] font-medium tracking-[-0.01em]">{c.name}</span>
                <span className="shrink-0 truncate text-[12.5px] text-muted">{c.hq}</span>
              </div>
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between px-1">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {hint && <span className="text-[11.5px] text-subtle">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
