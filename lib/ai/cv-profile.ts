import { z } from 'zod';
import { parseJsonLoose } from './gemini';
import { runAi } from './run';

const str = (max: number) => z.string().trim().max(max);
const list = (max: number, itemMax = 60) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      [...new Set(items.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean))]
        .map((v) => v.slice(0, itemMax))
        .slice(0, max),
    );
const optionalStr = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === 'string' && v.trim() && !/^(null|n\/a|unknown|none)$/i.test(v.trim()) ? v.trim().slice(0, max) : null));
const optionalInt = (min: number, max: number) =>
  z.unknown().optional().transform((v) => {
    const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
  });

export const SENIORITIES = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'] as const;
export const REMOTE_PREFS = ['remote', 'hybrid', 'onsite', 'any'] as const;

/** What the model must return for a CV. Lenient on input, strict on output. */
export const CvProfileSchema = z.object({
  fullName: optionalStr(120),
  headline: optionalStr(160),
  workField: optionalStr(60),
  country: optionalStr(60),
  targetRoles: list(6, 80),
  seniority: z.unknown().optional().transform((v) => {
    const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
    return (SENIORITIES as readonly string[]).includes(s) ? (s as (typeof SENIORITIES)[number]) : 'mid';
  }),
  yearsExperience: optionalInt(0, 50),
  skills: list(30),
  languages: list(8, 40),
  location: optionalStr(120),
  remotePreference: z.unknown().optional().transform((v) => {
    const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
    return (REMOTE_PREFS as readonly string[]).includes(s) ? (s as (typeof REMOTE_PREFS)[number]) : 'any';
  }),
  salaryMin: optionalInt(5_000, 500_000),
  salaryMax: optionalInt(5_000, 800_000),
  gaps: list(8, 120),
  summary: optionalStr(600),
});
export type CvProfile = z.infer<typeof CvProfileSchema>;

export function parseCvProfile(raw: unknown): CvProfile {
  const data = typeof raw === 'string' ? parseJsonLoose(raw) : raw;
  const parsed = CvProfileSchema.parse(data ?? {});
  if (parsed.salaryMin && parsed.salaryMax && parsed.salaryMax < parsed.salaryMin) {
    parsed.salaryMax = null;
  }
  return parsed;
}

const SYSTEM = `You read a CV and return a structured candidate profile as JSON.
Only use facts in the CV. Never invent employers, years, degrees or skills.
Guesses are allowed ONLY for: remotePreference, salaryMin/salaryMax (gross EUR per year for the candidate's market and seniority), and targetRoles (realistic next roles).
"gaps" = common requirements for the target roles that the CV does NOT show (short phrases, e.g. "No backend production experience", "No German").
Keys:
{"fullName": string|null, "headline": string|null, "targetRoles": string[] (2-5 job titles),
 "seniority": "intern"|"junior"|"mid"|"senior"|"lead"|"principal", "yearsExperience": number|null,
 "skills": string[] (up to 25, most important first, canonical names e.g. "React", "TypeScript"),
 "languages": string[] (spoken languages with level if given, e.g. "English (C1)"),
 "workField": one of "Software & IT","Design","Product","Data","Marketing","Sales","Customer support","Finance & accounting","HR","Healthcare","Education","Hospitality","Logistics","Engineering","Office & admin","Other",
 "location": string|null (city only, e.g. "Vienna"), "country": string|null (e.g. "Austria"), "remotePreference": "remote"|"hybrid"|"onsite"|"any",
 "salaryMin": number|null, "salaryMax": number|null, "gaps": string[], "summary": string (2 sentences, third person)}`;

export async function extractCvProfile(userId: string, cvText: string): Promise<CvProfile> {
  const reply = await runAi(userId, 'parse', `CV:\n"""\n${cvText.slice(0, 18_000)}\n"""`, {
    onboarding: true,
    tier: 'smart',
    system: SYSTEM,
    json: true,
    temperature: 0.1,
    maxTokens: 4096,
    maxWaitMs: 25_000,
  });
  return parseCvProfile(reply);
}
