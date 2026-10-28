'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, capsClass, fieldClass } from '@/components/ui/kit';
import { haptic } from '@/components/telegram-ui';
import { CvManager, type CvItem } from '@/components/cv-manager';
import { CompaniesWatch, keyOf, type CompanyOption } from '@/components/companies-watch';
import { SECTIONS, SECTION_COPY, TuningSection, type Section } from '@/components/profile-form';
import { cn } from '@/lib/utils';
import type { Draft } from '@/lib/profile/draft';

const ORDER: Section[] = ['work', 'where', 'languages', 'level', 'type', 'avoid'];

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="px-1">
        <h2 className={capsClass}>{title}</h2>
        {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Everything from the guided form, editable later. The form (not the CVs) drives search and scoring. */
const FACTS_PLACEHOLDER = `Available from 1 March, no notice period
Work permit for Austria, no sponsorship needed
Salary expectation: €55,000–65,000 gross per year
Portfolio: https://example.dev`;

export function ProfilePanel({ initial, writingRules: initialRules, facts: initialFacts }: { initial: Draft; writingRules: string; facts: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [rules, setRules] = useState(initialRules);
  const [facts, setFacts] = useState(initialFacts);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [cvs, setCvs] = useState<CvItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [watchDirty, setWatchDirty] = useState(false);

  useEffect(() => {
    void fetch('/api/cvs').then((r) => (r.ok ? r.json() : null)).then((d) => d && setCvs(d.cvs));
    void fetch('/api/companies').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      const watching: CompanyOption[] = d.watching.map((w: { name: string; ats: string; url: string; place: string | null; industry: string | null }) => ({
        name: w.name, ats: w.ats, slug: slugFromUrl(w.ats, w.url), place: w.place, industry: w.industry,
      }));
      setCompanies([...watching, ...d.suggestions.map((s: CompanyOption) => ({ ...s, suggested: true }))]);
      setPicked(new Set(watching.map(keyOf)));
    });
  }, []);

  const set = (patch: Partial<Draft>) => {
    setDirty(true);
    setMsg(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch('/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft, writingRules: rules, facts }) }).catch(() => null);
    let ok = Boolean(res?.ok);
    if (ok && watchDirty && companies) {
      const list = companies.filter((c) => picked.has(keyOf(c))).map(({ name, ats, slug }) => ({ name, ats, slug }));
      const r2 = await fetch('/api/companies', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companies: list }) }).catch(() => null);
      ok = Boolean(r2?.ok);
    }
    setSaving(false);
    if (!ok) {
      haptic('error');
      setMsg({ tone: 'danger', text: 'Could not save. Try again.' });
      return;
    }
    haptic('success');
    setDirty(false);
    setWatchDirty(false);
    setMsg({ tone: 'success', text: 'Saved. New settings apply to the next search.' });
    router.refresh();
  }

  return (
    <div className="space-y-10 pb-4">
      <Block title={`Your CVs · ${cvs.length}`} hint="For each job Jobber picks the CV that fits best and tells you which one to send.">
        <CvManager cvs={cvs} onChange={setCvs} compact />
      </Block>

      {ORDER.map((s) => {
        const Body = SECTIONS[s];
        return (
          <Block key={s} title={SECTION_COPY[s].title} hint={SECTION_COPY[s].hint}>
            <Body draft={draft} set={set} />
          </Block>
        );
      })}

      <Block title="Companies to watch" hint="Checked every day. Tick to add, untick to stop.">
        {companies ? (
          <CompaniesWatch
            options={companies}
            selected={picked}
            onToggle={(c) => { setWatchDirty(true); setMsg(null); setPicked((p) => { const n = new Set(p); n.has(keyOf(c)) ? n.delete(keyOf(c)) : n.add(keyOf(c)); return n; }); }}
            onAdd={(c) => { setWatchDirty(true); setCompanies((l) => [c, ...(l || []).filter((x) => keyOf(x) !== keyOf(c))]); setPicked((p) => new Set(p).add(keyOf(c))); }}
          />
        ) : (
          <div className="flex items-center gap-2 px-1 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        )}
      </Block>

      <Block title="Facts about me" hint="True things that aren’t in your CV, one per line: when you can start, work permit, salary, links, how to spell your company. Letters and form answers use them, and never claim anything that isn’t here or in your CV.">
        <textarea
          className={cn(fieldClass, 'min-h-[132px] resize-y text-[14px] leading-relaxed')}
          value={facts}
          placeholder={FACTS_PLACEHOLDER}
          maxLength={4000}
          onChange={(e) => { setFacts(e.target.value); setDirty(true); setMsg(null); }}
        />
      </Block>

      <Block title={SECTION_COPY.tuning.title} hint={SECTION_COPY.tuning.hint}>
        <TuningSection draft={draft} set={set} writingRules={rules} setWritingRules={(v) => { setRules(v); setDirty(true); }} />
      </Block>

      <div className={cn('sticky bottom-[calc(var(--tabbar-h,64px)+8px)] z-10 space-y-2 transition-opacity md:bottom-4', dirty || watchDirty || msg ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {(dirty || watchDirty) && (
          <Button size="lg" className="w-full shadow-lg" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null} Save changes
          </Button>
        )}
      </div>
    </div>
  );
}

function slugFromUrl(ats: string, url: string) {
  const u = new URL(url);
  switch (ats) {
    case 'greenhouse':
    case 'ashby':
    case 'lever':
    case 'smartrecruiters':
      return u.pathname.split('/')[3] || '';
    case 'workable':
      return u.pathname.split('/').pop() || '';
    case 'workday': {
      const [, , , tenant, site] = u.pathname.split('/');
      return `${tenant}:${u.hostname.split('.')[1]}:${site}`;
    }
    default:
      return u.hostname.split('.')[0];
  }
}
