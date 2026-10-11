'use client';

import { cn } from '@/lib/utils';
import { Chip, ChipChoice, ChipList, ChipMulti, Toggle } from '@/components/chips';
import { fieldClass } from '@/components/ui/kit';
import { LANG_LEVELS, WORK_FIELDS, type Draft } from '@/lib/profile/draft';

/** Sections of the guided profile form. Each works on the whole Draft. */
export type Section = 'work' | 'where' | 'languages' | 'level' | 'type' | 'avoid' | 'tuning';
type Props = { draft: Draft; set: (patch: Partial<Draft>) => void };

export const SECTION_COPY: Record<Section, { title: string; hint: string }> = {
  work: { title: 'What kind of work?', hint: 'Pick your field and the job titles you’d say yes to.' },
  where: { title: 'Where do you want to work?', hint: 'Jobs in your city come first, then your country, then remote.' },
  languages: { title: 'Which languages do you speak?', hint: 'So you don’t see jobs that need a language you don’t have.' },
  level: { title: 'What level are you?', hint: 'Honest is best — you can also see jobs one step up.' },
  type: { title: 'Type of job and pay', hint: 'Salary is optional. It only helps sort, never hides jobs.' },
  avoid: { title: 'Anything to avoid?', hint: 'Jobs mentioning these are skipped. You can still see them later.' },
  tuning: { title: 'Fine-tuning', hint: 'Optional. For when you want more control.' },
};

const ROLE_IDEAS: Record<string, string[]> = {
  'Software & IT': ['Frontend Developer', 'Full-stack Developer', 'Backend Developer', 'Product Engineer', 'Mobile Developer', 'QA Engineer', 'DevOps Engineer', 'IT Support'],
  Design: ['Product Designer', 'UX Designer', 'UI Designer', 'Graphic Designer'],
  Product: ['Product Manager', 'Product Owner', 'Project Manager'],
  Data: ['Data Analyst', 'Data Scientist', 'Data Engineer', 'BI Analyst'],
  Marketing: ['Marketing Manager', 'Content Marketing', 'Performance Marketing', 'Social Media Manager'],
  Sales: ['Account Executive', 'Sales Representative', 'Business Development'],
  'Customer support': ['Customer Support', 'Customer Success Manager', 'Call Center Agent'],
  'Finance & accounting': ['Accountant', 'Financial Analyst', 'Bookkeeper', 'Controller'],
  HR: ['Recruiter', 'HR Generalist', 'People Partner'],
  Healthcare: ['Nurse', 'Pflegefachkraft', 'Medical Assistant', 'Caregiver', 'Pharmacist'],
  Education: ['Teacher', 'Tutor', 'Kindergarten Teacher'],
  Hospitality: ['Waiter', 'Chef', 'Hotel Receptionist', 'Barista'],
  Logistics: ['Warehouse Worker', 'Driver', 'Logistics Coordinator'],
  Engineering: ['Mechanical Engineer', 'Electrical Engineer', 'Technician'],
  'Office & admin': ['Office Manager', 'Administrative Assistant', 'Receptionist'],
};

const OPEN_TO_OPTS = (city: string | null, country: string | null) =>
  [
    ['city', city ? `In ${city}` : 'My city'],
    ['country', country ? `Anywhere in ${country}` : 'Anywhere in my country'],
    ['remote', 'Remote'],
    ['relocation', 'I’d move for the right job'],
  ] as const;

const LEVEL_OPTS = [
  ['intern', 'Student / intern'],
  ['junior', 'Junior · 0–2 years'],
  ['mid', 'Mid · 2–5 years'],
  ['senior', 'Senior · 5+ years'],
  ['lead', 'Lead / manager'],
] as const;
const EMPLOYMENT_OPTS = [
  ['full_time', 'Full-time'],
  ['part_time', 'Part-time'],
  ['contract', 'Contract'],
  ['freelance', 'Freelance'],
  ['internship', 'Internship'],
] as const;
const AVOID_IDEAS = ['Night shifts', 'Weekend work', 'Cold calling', 'Commission only', 'Crypto', 'Gambling', 'Defence', 'Agency', 'On-call', 'Travel 50%'];
const LANG_IDEAS = ['English', 'German', 'Russian', 'Ukrainian', 'French', 'Spanish', 'Italian', 'Polish', 'Turkish', 'Arabic'];
const ALERT_OPTS = [
  ['instant', 'Right away'],
  ['daily', 'Once a day'],
  ['off', 'Never'],
] as const;

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 px-1">
      <p className="text-[13px] font-medium text-muted">{children}</p>
      {hint && <p className="text-[12px] text-subtle">{hint}</p>}
    </div>
  );
}

export function WorkSection({ draft, set }: Props) {
  const ideas = ROLE_IDEAS[draft.workField || ''] || [];
  return (
    <div className="space-y-7">
      <div>
        <Label>Field</Label>
        <div className="flex flex-wrap gap-2">
          {WORK_FIELDS.map((f) => (
            <Chip key={f} on={draft.workField === f} onClick={() => set({ workField: f })}>{f}</Chip>
          ))}
        </div>
      </div>
      <div>
        <Label hint="Tap ideas to add, or type your own">Job titles</Label>
        <ChipList value={draft.targetRoles} onChange={(targetRoles) => set({ targetRoles })} suggestions={ideas} placeholder="e.g. Shop assistant" max={10} />
      </div>
    </div>
  );
}

export function WhereSection({ draft, set }: Props) {
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <Label>City</Label>
          <input className={fieldClass} value={draft.city || ''} placeholder="e.g. Vienna" onChange={(e) => set({ city: e.target.value || null })} />
        </label>
        <label className="block">
          <Label>Country</Label>
          <input className={fieldClass} value={draft.country || ''} placeholder="e.g. Austria" onChange={(e) => set({ country: e.target.value || null })} />
        </label>
      </div>
      <div>
        <Label hint="Pick all that work for you">I’m open to</Label>
        <ChipMulti options={OPEN_TO_OPTS(draft.city, draft.country)} value={draft.openTo} onChange={(openTo) => set({ openTo })} />
      </div>
    </div>
  );
}

export function LanguagesSection({ draft, set }: Props) {
  const names = new Set(draft.languages.map((l) => l.name.toLowerCase()));
  const setLevel = (i: number, level: Draft['languages'][number]['level']) =>
    set({ languages: draft.languages.map((l, j) => (j === i ? { ...l, level } : l)) });
  return (
    <div className="space-y-5">
      {draft.languages.map((l, i) => (
        <div key={l.name} className="rounded-[var(--radius-card)] border border-line p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[15.5px] font-semibold">{l.name}</span>
            <button type="button" className="text-[13px] text-muted hover:text-danger" onClick={() => set({ languages: draft.languages.filter((_, j) => j !== i) })}>Remove</button>
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-full bg-surface-2 p-1">
            {LANG_LEVELS.map((lv) => (
              <button key={lv} type="button" onClick={() => setLevel(i, lv)} className={cn('rounded-full py-2 text-[13px] font-medium transition-all', l.level === lv ? 'bg-bg text-fg shadow-sm' : 'text-muted')}>
                {lv}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <Label>Add a language</Label>
        <ChipList
          value={[]}
          onChange={(v) => v[0] && !names.has(v[0].toLowerCase()) && set({ languages: [...draft.languages, { name: v[0], level: 'Good' }] })}
          suggestions={LANG_IDEAS.filter((n) => !names.has(n.toLowerCase()))}
          placeholder="Another language"
        />
      </div>
    </div>
  );
}

export function LevelSection({ draft, set }: Props) {
  return (
    <div className="space-y-6">
      <ChipChoice options={LEVEL_OPTS} value={draft.seniority} onChange={(seniority) => set({ seniority })} />
      <Toggle on={draft.stretch} onChange={(stretch) => set({ stretch })} label="Also show stretch roles" detail="Jobs one level above yours — a good way to grow." />
      <label className="block">
        <Label hint="Used when a job asks for “5+ years”">Years of experience</Label>
        <input className={cn(fieldClass, 'max-w-[140px]')} inputMode="numeric" value={draft.yearsExperience ?? ''} onChange={(e) => set({ yearsExperience: e.target.value ? Number(e.target.value.replace(/\D/g, '')) || 0 : null })} />
      </label>
    </div>
  );
}

export function TypeSection({ draft, set }: Props) {
  return (
    <div className="space-y-7">
      <div>
        <Label>Kind of contract</Label>
        <ChipMulti options={EMPLOYMENT_OPTS} value={draft.employmentTypes} onChange={(employmentTypes) => set({ employmentTypes })} />
      </div>
      <div>
        <Label hint="Gross per year, in your currency. Leave empty if unsure.">Salary (optional)</Label>
        <div className="grid grid-cols-2 gap-3">
          <input className={fieldClass} inputMode="numeric" placeholder="At least" value={draft.salaryMin ?? ''} onChange={(e) => set({ salaryMin: Number(e.target.value.replace(/\D/g, '')) || null })} />
          <input className={fieldClass} inputMode="numeric" placeholder="Ideally" value={draft.salaryMax ?? ''} onChange={(e) => set({ salaryMax: Number(e.target.value.replace(/\D/g, '')) || null })} />
        </div>
      </div>
    </div>
  );
}

export function AvoidSection({ draft, set }: Props) {
  return (
    <div className="space-y-7">
      <div>
        <Label>Skip jobs that mention</Label>
        <ChipList value={draft.avoidKeywords} onChange={(avoidKeywords) => set({ avoidKeywords })} suggestions={AVOID_IDEAS} placeholder="A word, tool or topic" max={30} />
      </div>
      <div>
        <Label>Never show these companies</Label>
        <ChipList value={draft.excludeCompanies} onChange={(excludeCompanies) => set({ excludeCompanies })} placeholder="Company name" max={50} />
      </div>
    </div>
  );
}

export function TuningSection({ draft, set, writingRules, setWritingRules }: Props & { writingRules?: string; setWritingRules?: (v: string) => void }) {
  return (
    <div className="space-y-7">
      <div>
        <Label hint="Used to search job boards">Search keywords</Label>
        <ChipList value={draft.keywords} onChange={(keywords) => set({ keywords })} suggestions={draft.targetRoles} placeholder="e.g. react developer" max={12} />
      </div>
      <div>
        <Label hint="The AI compares these with each job">Skills</Label>
        <ChipList value={draft.skills} onChange={(skills) => set({ skills })} placeholder="Add a skill" max={40} />
      </div>
      <label className="block">
        <Label hint="Plain words, e.g. “I prefer product companies over agencies. Small teams are a plus.”">Your rules for scoring</Label>
        <textarea className={cn(fieldClass, 'min-h-[96px] resize-y')} value={draft.scoringInstructions || ''} onChange={(e) => set({ scoringInstructions: e.target.value || null })} />
      </label>
      <NumberRow label="Hide matches below" suffix="score" value={draft.minScore ?? 0} min={0} max={90} step={5} onChange={(minScore) => set({ minScore })} />
      <NumberRow label="Ignore jobs older than" suffix="days" value={draft.maxJobAgeDays ?? 45} min={3} max={120} step={1} onChange={(maxJobAgeDays) => set({ maxJobAgeDays })} />
      <div>
        <Label>Telegram alerts</Label>
        <ChipChoice options={ALERT_OPTS} value={draft.alertFrequency} onChange={(alertFrequency) => set({ alertFrequency })} />
        {draft.alertFrequency !== 'off' && (
          <div className="mt-4">
            <NumberRow label="Only for scores from" suffix="" value={draft.alertThreshold ?? 70} min={40} max={95} step={5} onChange={(alertThreshold) => set({ alertThreshold })} />
          </div>
        )}
      </div>
      {setWritingRules && (
        <label className="block">
          <Label hint="How cover letters should sound">Writing rules</Label>
          <textarea className={cn(fieldClass, 'min-h-[96px] resize-y')} value={writingRules || ''} onChange={(e) => setWritingRules(e.target.value)} />
        </label>
      )}
    </div>
  );
}

function NumberRow({ label, suffix, value, min, max, step, onChange }: { label: string; suffix: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums">{value} <span className="text-[12.5px] font-normal text-muted">{suffix}</span></span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </div>
  );
}

export const SECTIONS: Record<Section, (p: Props) => React.ReactNode> = {
  work: WorkSection,
  where: WhereSection,
  languages: LanguagesSection,
  level: LevelSection,
  type: TypeSection,
  avoid: AvoidSection,
  tuning: TuningSection,
};
