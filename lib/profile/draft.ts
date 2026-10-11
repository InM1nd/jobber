import { z } from 'zod';
import type { CvProfile } from '@/lib/ai/cv-profile';

/**
 * The guided profile form. This — not the CV — is the source of truth for
 * search and scoring. CVs only prefill it.
 */

export const WORK_FIELDS = [
  'Software & IT', 'Design', 'Product', 'Data', 'Marketing', 'Sales', 'Customer support', 'Finance & accounting',
  'HR', 'Healthcare', 'Education', 'Hospitality', 'Logistics', 'Engineering', 'Office & admin', 'Other',
] as const;
export const OPEN_TO = ['city', 'country', 'remote', 'relocation'] as const;
export const LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead'] as const;
export const EMPLOYMENT = ['full_time', 'part_time', 'contract', 'internship', 'freelance'] as const;
export const LANG_LEVELS = ['Basic', 'Good', 'Fluent', 'Native'] as const;
export const ALERTS = ['instant', 'daily', 'off'] as const;

const strList = (max: number, len = 80) =>
  z.array(z.unknown()).catch([]).transform((a) =>
    [...new Set(a.filter((v): v is string => typeof v === 'string').map((v) => v.trim().slice(0, len)).filter(Boolean))].slice(0, max),
  );
const optStr = (len: number) =>
  z.unknown().optional().transform((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, len) : null));
const optInt = (min: number, max: number) =>
  z.unknown().optional().transform((v) => {
    const n = typeof v === 'string' ? Number(v.replace(/[^\d]/g, '')) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
  });
const oneOf = <T extends readonly string[]>(values: T, fallback: T[number]) =>
  z.unknown().optional().transform((v) => ((values as readonly string[]).includes(String(v)) ? (v as T[number]) : fallback));
const someOf = <T extends readonly string[]>(values: T) =>
  z.array(z.unknown()).catch([]).transform((a) => [...new Set(a.map(String).filter((v) => (values as readonly string[]).includes(v)))] as T[number][]);

export const LanguageSchema = z.object({ name: z.string().trim().min(1).max(40), level: oneOf(LANG_LEVELS, 'Good') });

export const DraftSchema = z.object({
  fullName: optStr(120),
  workField: optStr(60),
  targetRoles: strList(10),
  keywords: strList(12, 40),
  skills: strList(40, 60),
  city: optStr(80),
  country: optStr(60),
  openTo: someOf(OPEN_TO),
  languages: z.array(z.unknown()).catch([]).transform((a) => a.map((x) => LanguageSchema.safeParse(x)).filter((r) => r.success).map((r) => r.data!).slice(0, 8)),
  seniority: oneOf(LEVELS, 'mid'),
  stretch: z.unknown().optional().transform(Boolean),
  yearsExperience: optInt(0, 50),
  employmentTypes: someOf(EMPLOYMENT),
  salaryMin: optInt(1000, 800_000),
  salaryMax: optInt(1000, 800_000),
  avoidKeywords: strList(30, 60),
  excludeCompanies: strList(50, 80),
  gaps: strList(10, 140),
  scoringInstructions: optStr(2000),
  minScore: optInt(0, 100),
  alertThreshold: optInt(0, 100),
  alertFrequency: oneOf(ALERTS, 'daily'),
  maxJobAgeDays: optInt(1, 365),
});
export type Draft = z.infer<typeof DraftSchema>;

/** "English (C1)" / "German (A2)" / "Russian (native)" → name + plain level. */
export function parseLanguage(raw: string): { name: string; level: (typeof LANG_LEVELS)[number] } {
  const m = raw.match(/^([^(]+?)\s*(?:\(([^)]*)\))?$/);
  const name = (m?.[1] || raw).trim();
  const lvl = (m?.[2] || '').toLowerCase();
  const level = /native|mother|muttersprach|c2/.test(lvl)
    ? 'Native'
    : /fluent|c1|proficient|advanced|business/.test(lvl)
      ? 'Fluent'
      : /a1|a2|basic|beginner|elementary/.test(lvl)
        ? 'Basic'
        : 'Good';
  return { name, level };
}
export const languageString = (l: { name: string; level: string }) => `${l.name} (${l.level})`;

/** Merges one or more CV readings into a starting form. First CV wins for scalar fields. */
export function draftFromCvs(cvs: CvProfile[]): Draft {
  const first = cvs[0];
  const union = (pick: (c: CvProfile) => string[]) => [...new Set(cvs.flatMap(pick))];
  const remote = cvs.map((c) => c.remotePreference);
  const openTo: string[] = ['city'];
  if (!remote.includes('onsite')) openTo.push('remote');
  openTo.push('country');
  const langs = new Map<string, ReturnType<typeof parseLanguage>>();
  for (const l of union((c) => c.languages)) {
    const p = parseLanguage(l);
    if (!langs.has(p.name.toLowerCase())) langs.set(p.name.toLowerCase(), p);
  }
  const years = cvs.map((c) => c.yearsExperience).filter((n): n is number => n != null);
  return DraftSchema.parse({
    fullName: first?.fullName,
    workField: first?.workField,
    targetRoles: union((c) => c.targetRoles).slice(0, 8),
    keywords: [],
    skills: union((c) => c.skills).slice(0, 30),
    city: first?.location?.split(',')[0]?.trim(),
    country: first?.country || first?.location?.split(',')[1]?.trim(),
    openTo,
    languages: [...langs.values()],
    seniority: first?.seniority === 'principal' ? 'lead' : first?.seniority,
    stretch: false,
    yearsExperience: years.length ? Math.max(...years) : null,
    employmentTypes: ['full_time'],
    salaryMin: first?.salaryMin,
    salaryMax: first?.salaryMax,
    avoidKeywords: [],
    excludeCompanies: [],
    gaps: union((c) => c.gaps).slice(0, 8),
    minScore: 0,
    alertThreshold: 70,
    alertFrequency: 'daily',
    maxJobAgeDays: 45,
  });
}

export interface StoredProfileLike {
  fullName?: string | null;
  workField?: string | null;
  targetRoles?: string[];
  searchKeywords?: string[];
  skills: string[];
  location: string | null;
  country?: string | null;
  openTo?: string[];
  languages: string[];
  seniority?: string | null;
  stretch?: boolean;
  yearsExperience?: number | null;
  employmentTypes?: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  avoidKeywords?: string[];
  excludeCompanies?: string[];
  skillGaps: string[];
  scoringInstructions?: string | null;
  minScore?: number;
  alertThreshold?: number;
  alertFrequency?: string;
  maxJobAgeDays?: number;
  remoteOnly: boolean;
}

export function draftFromProfile(p: StoredProfileLike): Draft {
  const [city, country] = (p.location || '').split(',').map((s) => s.trim());
  return DraftSchema.parse({
    ...p,
    keywords: p.searchKeywords,
    city: city || null,
    country: p.country || country || null,
    openTo: p.openTo?.length ? p.openTo : p.remoteOnly ? ['remote'] : ['city', 'country', 'remote'],
    languages: p.languages.map(parseLanguage),
    gaps: p.skillGaps,
  });
}

/** Form → Profile columns. Keeps legacy columns (location, remoteOnly, stackKeywords) in sync. */
export function profilePatchFromDraft(d: Draft) {
  const remoteOnly = d.openTo.length === 1 && d.openTo[0] === 'remote';
  return {
    fullName: d.fullName,
    workField: d.workField,
    targetRoles: d.targetRoles,
    searchKeywords: d.keywords,
    skills: d.skills,
    stackKeywords: d.skills.slice(0, 8),
    location: [d.city, d.country].filter(Boolean).join(', ') || null,
    country: d.country,
    openTo: d.openTo,
    remoteOnly,
    languages: d.languages.map(languageString),
    seniority: d.seniority,
    stretch: d.stretch,
    yearsExperience: d.yearsExperience,
    employmentTypes: d.employmentTypes,
    salaryMin: d.salaryMin,
    salaryMax: d.salaryMax && d.salaryMin && d.salaryMax < d.salaryMin ? null : d.salaryMax,
    avoidKeywords: d.avoidKeywords,
    excludeCompanies: d.excludeCompanies,
    skillGaps: d.gaps,
    scoringInstructions: d.scoringInstructions,
    minScore: d.minScore ?? 0,
    alertThreshold: d.alertThreshold ?? 70,
    alertFrequency: d.alertFrequency,
    maxJobAgeDays: d.maxJobAgeDays ?? 45,
  };
}
