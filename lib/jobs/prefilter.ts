/**
 * Rule-based pre-filter: cheap checks that run before any AI call so only
 * plausible vacancies reach Gemini. Also decides the location tier
 * (city → country → remote → relocation). Pure functions, unit tested.
 */
import { cityTerms, countryOfCity, countryTerms } from '@/lib/geo';

export type LocationTier = 'city' | 'country' | 'remote' | 'relocation' | 'other';
export const TIER_ORDER: Record<string, number> = { city: 0, country: 1, remote: 2, relocation: 3, other: 4 };

export interface PrefilterProfile {
  targetRoles: string[];
  keywords: string[];
  skills: string[];
  location?: string | null;
  city?: string | null;
  country?: string | null;
  /** "city" | "country" | "remote" | "relocation"; empty = legacy (remoteOnly decides) */
  openTo?: string[];
  remoteOnly: boolean;
  languages: string[];
  seniority?: string | null;
  stretch?: boolean;
  workField?: string | null;
  avoidKeywords?: string[];
  excludeCompanies?: string[];
  employmentTypes?: string[];
  maxJobAgeDays?: number | null;
}

export interface PrefilterJob {
  title: string;
  company?: string | null;
  location?: string | null;
  remote: boolean;
  description: string;
  postedAt?: Date | null;
}

export interface PrefilterResult {
  pass: boolean;
  reason?: string;
  tier: LocationTier;
  /** Higher = more relevant; local jobs first, then keyword overlap. */
  relevance: number;
}

const GENERIC = new Set([
  'engineer', 'developer', 'dev', 'software', 'specialist', 'and', 'of', 'the', 'for', 'in', 'with', 'm', 'w', 'd', 'f', 'x',
  'senior', 'junior', 'mid', 'middle', 'lead', 'principal', 'staff', 'sr', 'jr', 'intern', 'level', 'i', 'ii', 'iii',
]);

export function normalizeText(s: string) {
  return ` ${s
    .toLowerCase()
    .replace(/front[\s-]+end/g, 'frontend')
    .replace(/back[\s-]+end/g, 'backend')
    .replace(/full[\s-]+stack/g, 'fullstack')
    .replace(/react\.?js/g, 'react')
    .replace(/vue\.?js/g, 'vue')
    .replace(/node\.?js/g, 'node')
    .replace(/next\.?js/g, 'nextjs')
    .replace(/[^a-z0-9+#.äöüß]+/g, ' ')} `;
}

export function roleTerms(profile: Pick<PrefilterProfile, 'targetRoles' | 'keywords'>) {
  const terms = new Set<string>();
  for (const phrase of [...profile.targetRoles, ...profile.keywords]) {
    for (const word of normalizeText(phrase).trim().split(/\s+/)) {
      if (word.length >= 2 && !GENERIC.has(word)) terms.add(word);
    }
  }
  return [...terms];
}

const has = (text: string, term: string) => text.includes(` ${term} `);

const GENERIC_SWE = /software (engineer|developer)|full[\s-]?stack|web (developer|engineer)|product engineer|application (engineer|developer)|softwareentwickler|\b(engineer|developer)\b/i;
const OFF_TRACK = /backend|back-end|data|machine learning|\bml\b|security|devops|\bsre\b|reliability|platform|infrastructure|\bios\b|android|mobile|embedded|\bqa\b|test|support|solutions|sales|database|postgres|cloud|network|firmware|hardware|manager|deployment|grc|gtm|advocate|relations|evangelist|trainer|evaluator/i;
const MANAGERISH = /\b(product|project|program|account|marketing|sales|community|engineering) manager\b|\bhead of\b/i;
const ENGINEERING = /engineer|developer|\bdev\b|programmer|entwickler|\bswe\b|architect|hacker/i;

/** 0 intern · 1 junior · 2 mid · 3 senior · 4 lead/staff · 5 principal/director. null = not stated. */
export function titleLevel(title: string): number | null {
  const t = title.toLowerCase();
  if (/\b(intern|internship|werkstudent|working student|praktik|trainee|apprentice|ausbildung|lehrling)\b/.test(t)) return 0;
  if (/\b(junior|jr\.?|entry[- ]level|graduate|berufseinst)/.test(t)) return 1;
  if (/\b(director|vp|vice president|chief|head of|principal|distinguished)\b/.test(t)) return 5;
  if (/\b(staff|lead|leiter|teamlead|tech lead)\b/.test(t)) return 4;
  if (/\b(senior|sr\.?)\b/.test(t)) return 3;
  if (/\b(mid|intermediate|medior|ii)\b/.test(t)) return 2;
  return null;
}
export const LEVEL_INDEX: Record<string, number> = { intern: 0, junior: 1, mid: 2, senior: 3, lead: 4, principal: 5 };

const GERMAN_REQUIRED =
  /(fließend|fliessend|sehr gute?n?|verhandlungssicher|exzellente?)[^.\n]{0,40}deutsch|deutsch[^.\n]{0,30}(c1|c2|fließend|muttersprach|verhandlungssicher)|fluent (in )?german|german (language )?(c1|c2|fluency|native|is a must|required)|native german|business[- ]fluent german/i;
const GERMAN_WORDS = /\b(und|wir|sie|mit|für|eine?n?|dein|deine|ihre|bei|uns|aufgaben|kenntnisse|erfahrung)\b/gi;

const NON_EU_ONLY =
  /\b(us only|usa only|u\.s\. only|united states only|must be (based|located) in the (us|united states)|americas only|canada only|latam only|apac only|us[- ]based|north america only)\b/i;
const NON_EU_LOCATION = /^(us|usa|united states|canada|americas|north america|latam|apac|india|australia)$/i;
const EUROPE = /europe|emea|\beu\b|austria|österreich|germany|deutschland|dach|vienna|wien|berlin|munich|münchen|netherlands|ireland|france|spain|portugal|poland|czech|switzerland|italy|uk|united kingdom|sweden|denmark|finland|norway|belgium|cet|cest/i;
const WIDE = /worldwide|anywhere|global|international/i;
const EUROPE_WIDE = /europe|\beu\b|emea|cet|cest|dach/i;

/** "Remote (Poland, Serbia)" / "Remote - Germany" → "poland, serbia" / "germany"; null when unrestricted. */
export function remoteRestriction(location: string): string | null {
  const loc = location.toLowerCase().trim();
  const paren = loc.match(/^remote\s*\(([^)]+)\)/);
  if (paren) return paren[1];
  const inside = loc.match(/^remote (?:in|from|within) (?:the )?(.+)$/);
  if (inside) return inside[1];
  const dash = loc.match(/^remote\s*[-–,:]\s*(.+)$/);
  if (dash) return dash[1];
  const suffix = loc.match(/^(.+?)\s*[-–(]?\s*remote\)?$/);
  if (suffix && suffix[1] && !/^(fully|100%|full)$/.test(suffix[1])) return suffix[1];
  return null;
}

export function speaksGerman(languages: string[]) {
  return languages.some((l) => /german|deutsch/i.test(l) && !/\b(a1|a2|basic|beginner)\b/i.test(l));
}

function place(profile: PrefilterProfile) {
  const [locCity, locCountry] = (profile.location || '').split(',').map((s) => s?.trim());
  const city = profile.city ?? locCity ?? null;
  const country = (profile.country || locCountry || countryOfCity(city) || '').toLowerCase() || null;
  return { city, country };
}

const includesAny = (hay: string, terms: string[]) => terms.some((t) => (t.startsWith(' ') ? ` ${hay} `.includes(t) : hay.includes(t)));

/** Decides where a job sits relative to the user; `null` reason = acceptable for remote rules. */
export function locationTier(profile: PrefilterProfile, job: PrefilterJob): { tier: LocationTier; reason?: string } {
  const { city, country } = place(profile);
  const jobLoc = (job.location || '').toLowerCase().replace(/[()]/g, (c) => (c === '(' ? ' (' : ') '));
  const cities = cityTerms(city);
  const countries = countryTerms(country);
  const userInEurope = !(profile.location || country) || EUROPE.test(`${profile.location || ''} ${country || ''}`);
  const remoteish = job.remote || /\b(remote|anywhere|worldwide|europe|emea|home ?office|homeoffice)\b/i.test(jobLoc);

  if (cities.length && includesAny(jobLoc, cities)) return { tier: 'city' };
  if (remoteish) {
    if (userInEurope && (NON_EU_ONLY.test(job.description.slice(0, 4000)) || NON_EU_ONLY.test(jobLoc) || NON_EU_LOCATION.test(jobLoc.trim()))) {
      return { tier: 'other', reason: 'Remote, but outside your region' };
    }
    const allowed = remoteRestriction(jobLoc.trim()) ?? (jobLoc && !/remote/.test(jobLoc) ? jobLoc : null);
    if (allowed && (cities.length || countries.length) && !includesAny(allowed, [...cities, ...countries]) && !WIDE.test(allowed) && !(userInEurope && EUROPE_WIDE.test(allowed))) {
      return { tier: 'other', reason: 'Remote, but only from other countries' };
    }
    return { tier: 'remote' };
  }
  if (!jobLoc.trim()) return { tier: 'country' };
  if (countries.length && includesAny(jobLoc, countries)) return { tier: 'country' };
  return { tier: 'relocation', reason: 'On-site in another country' };
}

function allowedTiers(profile: PrefilterProfile): Set<LocationTier> {
  const open = profile.openTo?.length ? profile.openTo : profile.remoteOnly ? ['remote'] : ['city', 'country', 'remote'];
  const s = new Set<LocationTier>(open as LocationTier[]);
  if (s.has('country')) s.add('city'); // anywhere in the country includes your city
  return s;
}

const TIER_LABEL: Record<LocationTier, string> = {
  city: 'In your city', country: 'Elsewhere in your country', remote: 'Remote', relocation: 'Needs relocation', other: 'Outside your area',
};
const TIER_BONUS: Record<LocationTier, number> = { city: 12, country: 7, remote: 3, relocation: 0, other: 0 };

export function prefilterJob(profile: PrefilterProfile, job: PrefilterJob, now = Date.now()): PrefilterResult {
  const title = normalizeText(job.title);
  const body = normalizeText(job.description.slice(0, 6000));
  const terms = roleTerms(profile);
  const skills = profile.skills.map((s) => normalizeText(s).trim()).filter((s) => s.length >= 2);
  const loc = locationTier(profile, job);
  const reject = (reason: string): PrefilterResult => ({ pass: false, reason, tier: loc.tier, relevance: 0 });

  // 0) Hard user rules: excluded companies, things to avoid, job age, employment type.
  const company = (job.company || '').toLowerCase();
  const ex = profile.excludeCompanies?.find((c) => c && company && company.includes(c.toLowerCase()));
  if (ex) return reject(`You excluded ${ex}`);
  const head = normalizeText(`${job.title} ${job.company || ''} ${job.description.slice(0, 800)}`);
  const avoid = profile.avoidKeywords?.find((k) => k.trim() && has(head, normalizeText(k).trim()));
  if (avoid) return reject(`Mentions “${avoid}” (you avoid it)`);
  if (profile.maxJobAgeDays && job.postedAt && now - job.postedAt.getTime() > profile.maxJobAgeDays * 86_400_000) {
    return reject(`Older than ${profile.maxJobAgeDays} days`);
  }
  const types = profile.employmentTypes || [];
  if (types.length && !types.includes('internship') && /\b(intern|internship|praktik|werkstudent|working student)\b/i.test(job.title)) return reject('Internship');
  if (types.length && !types.includes('part_time') && /\b(part[- ]time|teilzeit|minijob|geringfügig)\b/i.test(job.title)) return reject('Part-time');
  if (types.length && types.every((t) => t === 'part_time') && /\b(full[- ]time|vollzeit)\b/i.test(job.title)) return reject('Full-time only');

  // 1) Role relevance: the title must mention a role term or a core skill.
  const titleHits = terms.filter((t) => has(title, t)).length + skills.filter((s) => has(title, s)).length;
  const bodyHits = skills.filter((s) => has(body, s)).length;
  const genericFit = GENERIC_SWE.test(job.title) && !OFF_TRACK.test(job.title) && bodyHits >= 2;
  if ((terms.length || skills.length) && titleHits === 0 && !genericFit) return reject('Title does not match your roles');
  if (profile.targetRoles.length && profile.targetRoles.every((r) => ENGINEERING.test(r)) && (!ENGINEERING.test(job.title) || MANAGERISH.test(job.title))) {
    return reject('Not an engineering role');
  }

  // 2) Seniority (one level up allowed with "stretch").
  const user = LEVEL_INDEX[(profile.seniority || 'mid').toLowerCase()] ?? 2;
  const jobLevel = titleLevel(job.title);
  if (jobLevel != null) {
    const up = profile.stretch ? 1 : 0;
    if (jobLevel > user + up) return reject(profile.stretch ? 'More than one level up' : 'Too senior');
    if (user >= 3 && jobLevel <= 1) return reject('Too junior');
  }

  // 3) Language.
  if (!speaksGerman(profile.languages)) {
    if (GERMAN_REQUIRED.test(job.description)) return reject('Requires fluent German');
    const germanWords = (job.description.slice(0, 3000).match(GERMAN_WORDS) || []).length;
    if (germanWords >= 12) return reject('Vacancy is in German');
  }

  // 4) Location tier vs. what the user is open to.
  if (loc.tier === 'other') return reject(loc.reason || TIER_LABEL.other);
  if (!allowedTiers(profile).has(loc.tier)) {
    const allowed = allowedTiers(profile);
    if (loc.tier === 'remote') return reject('Remote (you chose on-site)');
    if (loc.tier === 'relocation') return reject(loc.reason || TIER_LABEL.relocation);
    return reject(allowed.has('remote') && !allowed.has('city') ? 'Not remote' : 'Not in your city');
  }

  return { pass: true, tier: loc.tier, relevance: TIER_BONUS[loc.tier] + titleHits * 3 + bodyHits };
}

export { TIER_LABEL };
