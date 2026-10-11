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
  /** Higher = more relevant (equals preScore when passing). */
  relevance: number;
  /** Deterministic 0-100 fit used to rank before AI; only set when pass. */
  preScore?: number;
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
const ENGINEERING = /engineer|developer|front[\s-]?end|back[\s-]?end|full[\s-]?stack|programmierer|\bdev\b|programmer|entwickler|\bswe\b|architect|hacker/i;

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

  // 1) Field: hard-drop only clear mismatches (no role/skill signal at all, or a
  //    non-engineering job for an engineering-only target). Adjacent titles
  //    (Fullstack vs Frontend, generic SWE, backend…) stay and are ranked.
  const synonyms = roleSynonyms(profile);
  const titleHits = terms.filter((t) => has(title, t)).length + skills.filter((s) => has(title, s)).length;
  const synHits = synonyms.filter((t) => has(title, t)).length;
  const bodyHits = skills.filter((s) => has(body, s)).length;
  const engineeringTarget = profile.targetRoles.length > 0 && profile.targetRoles.every((r) => ENGINEERING.test(r));
  if (engineeringTarget && (!ENGINEERING.test(job.title) || MANAGERISH.test(job.title))) return reject('Not an engineering role');
  const genericFit = GENERIC_SWE.test(job.title) && bodyHits >= 1;
  if ((terms.length || skills.length) && titleHits + synHits === 0 && !genericFit && !(engineeringTarget && bodyHits >= 2)) {
    return reject('Title does not match your roles');
  }

  // 2) Seniority: more than one level above what you allow is a clear mismatch.
  const user = LEVEL_INDEX[(profile.seniority || 'mid').toLowerCase()] ?? 2;
  const jobLevel = titleLevel(job.title);
  if (jobLevel != null) {
    if (jobLevel > user + 1) return reject(profile.stretch ? 'More than one level up' : 'Too senior');
    if (user >= 3 && jobLevel <= 1) return reject('Too junior');
  }

  // 3) Language.
  let languagePts = 10;
  if (!speaksGerman(profile.languages)) {
    if (GERMAN_REQUIRED.test(job.description)) return reject('Requires fluent German');
    const germanWords = (job.description.slice(0, 3000).match(GERMAN_WORDS) || []).length;
    if (germanWords >= 12) return reject('Vacancy is in German');
    if (germanWords >= 6 || (!job.description.trim() && /\b(m\/w\/d|w\/m\/d|mitarbeiter|entwickler)\b/i.test(job.title))) languagePts = 4;
  }

  // 4) Location tier vs. what the user is open to.
  if (loc.tier === 'other') return reject(loc.reason || TIER_LABEL.other);
  if (!allowedTiers(profile).has(loc.tier)) {
    const allowed = allowedTiers(profile);
    if (loc.tier === 'remote') return reject('Remote (you chose on-site)');
    if (loc.tier === 'relocation') return reject(loc.reason || TIER_LABEL.relocation);
    return reject(allowed.has('remote') && !allowed.has('city') ? 'Not remote' : 'Not in your city');
  }

  // 5) Deterministic pre-score 0-100 (ranking only; AI decides the real score).
  const roleTitle = bestRoleSimilarity(profile.targetRoles, job.title);
  let titlePts = Math.round(roleTitle * 30) + Math.min(10, titleHits * 4 + synHits * 3);
  if (OFF_TRACK.test(job.title) && roleTitle < 0.6 && !profile.targetRoles.some((r) => OFF_TRACK.test(r))) titlePts = Math.min(titlePts, 10);
  const skillPts = Math.min(25, (skills.length ? Math.round((bodyHits / Math.min(skills.length, 6)) * 20) : 10) + Math.min(5, titleHits * 2));
  const tierPts = { city: 15, country: 11, remote: 9, relocation: 4, other: 0 }[loc.tier];
  const senPts = jobLevel == null ? 8 : jobLevel === user ? 10 : jobLevel === user + 1 ? (profile.stretch ? 7 : 3) : jobLevel === user - 1 ? 6 : 2;
  const thin = job.description.trim().length < 200 ? 0.9 : 1; // list-only scrapes carry less evidence
  const preScore = Math.max(0, Math.min(100, Math.round((Math.min(40, titlePts) + skillPts + tierPts + senPts + languagePts) * thin)));
  return { pass: true, tier: loc.tier, relevance: preScore, preScore };
}

/** Related titles that count as the same family (Frontend ≈ React/UI/Web, Fullstack ≈ Software/Product engineer…). */
const FAMILIES: string[][] = [
  ['frontend', 'react', 'ui', 'web', 'nextjs', 'vue', 'angular', 'javascript', 'typescript', 'fullstack'],
  ['fullstack', 'frontend', 'backend', 'software', 'web', 'product', 'application', 'node', 'typescript'],
  ['product', 'fullstack', 'growth', 'software', 'frontend'],
  ['backend', 'fullstack', 'api', 'platform', 'node', 'java', 'python', 'go'],
  ['design', 'ux', 'ui', 'product', 'frontend', 'creative'],
  ['data', 'analytics', 'analyst', 'bi', 'ml'],
];

export function roleSynonyms(profile: Pick<PrefilterProfile, 'targetRoles' | 'keywords'>) {
  const words = new Set(roleTerms(profile));
  const out = new Set<string>();
  for (const fam of FAMILIES) if (words.has(fam[0])) fam.forEach((w) => out.add(w));
  for (const w of words) out.delete(w);
  return [...out];
}

const tokens = (s: string) => normalizeText(s).trim().split(/\s+/).filter((w) => w.length >= 2 && !GENERIC.has(w));

/** 0..1: best overlap between the job title and any target role; family words count half. */
export function bestRoleSimilarity(targetRoles: string[], jobTitle: string) {
  const t = new Set(tokens(jobTitle));
  if (!t.size) return 0;
  let best = 0;
  for (const role of targetRoles) {
    const r = tokens(role);
    if (!r.length) continue;
    let hit = 0;
    for (const w of r) {
      if (t.has(w)) hit += 1;
      else if (FAMILIES.some((f) => f[0] === w && f.some((x) => t.has(x)))) hit += 0.5;
    }
    best = Math.max(best, hit / r.length);
  }
  return best;
}

export { TIER_LABEL };
