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
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        {hint && <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{hint}</p>}
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
    <div className="pb-4 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
      <ProfileNav />
      <div className="min-w-0 space-y-6">
      <Group id="you" title="You" hint="What Jobber knows about you. Letters and answers use only this and your CVs.">
      <Block title={`Your CVs · ${cvs.length}`} hint="For each job Jobber picks the CV that fits best and tells you which one to send.">
        <CvManager cvs={cvs} onChange={setCvs} compact />
      </Block>

      <Block title="Facts about me" hint="True things that aren’t in your CV, one per line: when you can start, work permit, salary, links. Letters never claim anything that isn’t here or in your CV.">
        <textarea
          className={cn(fieldClass, 'min-h-[132px] resize-y text-[14px] leading-relaxed')}
          value={facts}
          placeholder={FACTS_PLACEHOLDER}
          maxLength={4000}
          onChange={(e) => { setFacts(e.target.value); setDirty(true); setMsg(null); }}
        />
      </Block>

      <Block title="How your letters sound">
        <TuningSection part="writing" draft={draft} set={set} writingRules={rules} setWritingRules={(v) => { setRules(v); setDirty(true); }} />
      </Block>
      </Group>

      <Group id="looking" title="What you’re looking for" hint="Search and the filters follow this. Change it any time — the best matches are re-scored.">
      {ORDER.map((s) => {
        const Body = SECTIONS[s];
        return (
          <Block key={s} title={SECTION_COPY[s].title} hint={SECTION_COPY[s].hint}>
            <Body draft={draft} set={set} />
          </Block>
        );
      })}
      </Group>

      <Group id="sources" title="Where Jobber looks" hint="Company career pages checked every day, and the keywords used on job boards.">
      <Block title="Companies to watch" hint="Tick to add, untick to stop.">
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

      <Block title="Search keywords">
        <TuningSection part="keywords" draft={draft} set={set} />
      </Block>
      </Group>

      <Group id="scoring" title="Scoring & alerts" hint="How matches are judged, which ones you see, and when Telegram tells you.">
        <TuningSection part="scoring" draft={draft} set={set} />
      </Group>

      <div className={cn('sticky bottom-[calc(var(--tabbar-h,64px)+8px)] z-10 space-y-2 transition-opacity md:bottom-4', dirty || watchDirty || msg ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {(dirty || watchDirty) && (
          <Button size="lg" className="w-full shadow-lg" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null} Save changes
          </Button>
        )}
      </div>
      </div>
    </div>
  );
}

const GROUPS = [
  { id: 'you', label: 'You' },
  { id: 'looking', label: 'Looking for' },
  { id: 'sources', label: 'Where to look' },
  { id: 'scoring', label: 'Scoring & alerts' },
];

/** One part of the profile, as a card with its own heading (the nav jumps here). */
function Group({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-[var(--radius-card)] border border-line px-5 py-5 md:px-7 md:py-6 lg:scroll-mt-8">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">{hint}</p>
      <div className="mt-6 space-y-8 divide-line [&>section+section]:border-t [&>section+section]:pt-7">{children}</div>
    </section>
  );
}

/** Jump links: a sticky row of chips on the phone, a sticky side list on desktop; the visible group is highlighted. */
function ProfileNav() {
  const [active, setActive] = useState('you');
  useEffect(() => {
    const els = GROUPS.map((g) => document.getElementById(g.id)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav aria-label="Profile sections" className="sticky top-[calc(8px+var(--safe-top))] z-20 -mx-5 mb-5 bg-bg/90 px-5 py-2 backdrop-blur lg:top-8 lg:mx-0 lg:mb-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-0">
      <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:gap-0.5">
        {GROUPS.map((g) => (
          <li key={g.id} className="shrink-0">
            <button
              type="button"
              onClick={() => go(g.id)}
              aria-current={active === g.id ? 'true' : undefined}
              className={cn(
                'h-9 rounded-full px-3.5 text-[14px] font-medium transition-colors lg:w-full lg:text-left',
                active === g.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted hover:text-fg lg:bg-transparent',
              )}
            >
              {g.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
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
