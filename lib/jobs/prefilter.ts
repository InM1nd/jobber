/**
 * Rule-based pre-filter: cheap checks that run before any AI call so only
 * plausible vacancies reach Gemini. Pure functions, unit tested.
 */

export interface PrefilterProfile {
  targetRoles: string[];
  keywords: string[];
  skills: string[];
  location?: string | null;
  remoteOnly: boolean;
  languages: string[];
  seniority?: string | null;
}

export interface PrefilterJob {
  title: string;
  location?: string | null;
  remote: boolean;
  description: string;
}

export interface PrefilterResult {
  pass: boolean;
  reason?: string;
  /** Higher = more keyword overlap; used to score the best candidates first. */
  relevance: number;
}

const GENERIC = new Set([
  'engineer', 'developer', 'dev', 'software', 'specialist', 'and', 'of', 'the', 'for', 'in', 'with',
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

const GENERIC_SWE = /software (engineer|developer)|full[\s-]?stack|web (developer|engineer)|product engineer|application (engineer|developer)|\b(engineer|developer)\b/i;
const OFF_TRACK = /backend|back-end|data|machine learning|\bml\b|security|devops|\bsre\b|reliability|platform|infrastructure|\bios\b|android|mobile|embedded|\bqa\b|test|support|solutions|sales|database|postgres|cloud|network|firmware|hardware|manager|deployment|grc|gtm|advocate|relations|evangelist|trainer|evaluator/i;
const MANAGERISH = /\b(product|project|program|account|marketing|sales|community|engineering) manager\b|\bhead of\b/i;
const ENGINEERING = /engineer|developer|\bdev\b|programmer|entwickler|\bswe\b|architect|hacker/i;
const SENIOR_TITLE = /\b(staff|principal|director|head of|vp|vice president|chief|distinguished)\b/i;
const LEAD_TITLE = /\b(lead|manager)\b/i;
const JUNIOR_TITLE = /\b(intern|internship|werkstudent|working student|praktikum|praktikant|trainee|apprentice|ausbildung|junior)\b/i;

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

function speaksGerman(languages: string[]) {
  return languages.some((l) => /german|deutsch/i.test(l) && !/\b(a1|a2|basic|beginner)\b/i.test(l));
}

function locationParts(location?: string | null) {
  const parts = (location || '').toLowerCase().split(/[,/]/).map((p) => p.trim()).filter(Boolean);
  const aliases: Record<string, string[]> = {
    vienna: ['wien'], wien: ['vienna'], munich: ['münchen'], münchen: ['munich'],
    austria: ['österreich'], germany: ['deutschland'], cologne: ['köln'],
  };
  return [...new Set(parts.flatMap((p) => [p, ...(aliases[p] || [])]))];
}

export function prefilterJob(profile: PrefilterProfile, job: PrefilterJob): PrefilterResult {
  const title = normalizeText(job.title);
  const body = normalizeText(job.description.slice(0, 6000));
  const terms = roleTerms(profile);
  const skills = profile.skills.map((s) => normalizeText(s).trim()).filter((s) => s.length >= 2);

  // 1) Role relevance: the title must mention a role term or a core skill,
  //    and for engineering targets it must be an engineering title (not "Product Manager").
  const titleHits = terms.filter((t) => has(title, t)).length + skills.filter((s) => has(title, s)).length;
  const bodyHits = skills.filter((s) => has(body, s)).length;
  // Generic titles ("Software Engineer, Auth") pass when the text uses the candidate's stack.
  const genericFit = GENERIC_SWE.test(job.title) && !OFF_TRACK.test(job.title) && bodyHits >= 2;
  if ((terms.length || skills.length) && titleHits === 0 && !genericFit) {
    return { pass: false, reason: 'Title does not match target roles', relevance: 0 };
  }
  if (profile.targetRoles.length && profile.targetRoles.every((r) => ENGINEERING.test(r)) && (!ENGINEERING.test(job.title) || MANAGERISH.test(job.title))) {
    return { pass: false, reason: 'Not an engineering role', relevance: 0 };
  }

  // 2) Seniority.
  const seniority = (profile.seniority || 'mid').toLowerCase();
  if ((seniority === 'intern' || seniority === 'junior') && (SENIOR_TITLE.test(job.title) || LEAD_TITLE.test(job.title))) {
    return { pass: false, reason: 'Too senior', relevance: 0 };
  }
  if (seniority === 'mid' && SENIOR_TITLE.test(job.title)) {
    return { pass: false, reason: 'Too senior', relevance: 0 };
  }
  if (['senior', 'lead', 'principal'].includes(seniority) && JUNIOR_TITLE.test(job.title)) {
    return { pass: false, reason: 'Too junior', relevance: 0 };
  }

  // 3) Language.
  if (!speaksGerman(profile.languages)) {
    if (GERMAN_REQUIRED.test(job.description)) return { pass: false, reason: 'Requires fluent German', relevance: 0 };
    const germanWords = (job.description.slice(0, 3000).match(GERMAN_WORDS) || []).length;
    if (germanWords >= 12) return { pass: false, reason: 'Vacancy is in German', relevance: 0 };
  }

  // 4) Location / remote.
  const userParts = locationParts(profile.location);
  const userInEurope = !profile.location || EUROPE.test(profile.location);
  const jobLoc = (job.location || '').toLowerCase();
  const remoteish = job.remote || /\b(remote|anywhere|europe|emea|worldwide)\b/i.test(jobLoc);
  if (remoteish) {
    if (userInEurope && (NON_EU_ONLY.test(job.description.slice(0, 4000)) || NON_EU_ONLY.test(jobLoc) || NON_EU_LOCATION.test(jobLoc.trim()))) {
      return { pass: false, reason: 'Remote, but outside your region', relevance: 0 };
    }
    // A "remote" job whose location is a plain place list ("USA, Canada", "London, UK") is limited to it.
    const allowed = remoteRestriction(jobLoc) ?? (jobLoc && !/remote/.test(jobLoc) ? jobLoc : null);
    if (allowed && userParts.length && !userParts.some((p) => allowed.includes(p)) && !WIDE.test(allowed) && !(userInEurope && EUROPE_WIDE.test(allowed))) {
      return { pass: false, reason: 'Remote, but only from other countries', relevance: 0 };
    }
  } else {
    if (profile.remoteOnly) return { pass: false, reason: 'Not remote', relevance: 0 };
    if (jobLoc && userParts.length && !userParts.some((p) => jobLoc.includes(p))) {
      return { pass: false, reason: 'On-site in another city', relevance: 0 };
    }
  }

  const local = userParts.length && userParts.some((p) => jobLoc.includes(p)) ? 4 : 0;
  return { pass: true, relevance: titleHits * 3 + bodyHits + local };
}
