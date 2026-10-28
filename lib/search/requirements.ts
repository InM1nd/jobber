/**
 * Requirement matching: the model only says which of the candidate's skills each
 * requirement is about; code decides covered / partial / gap from the profile and CVs,
 * so the result is deterministic and explainable. A model can't add a skill by naming it.
 * Idea from AienTech/dossier (match-requirements), written for Jobber's batch scoring.
 */

export type RequirementResult = 'covered' | 'partial' | 'gap';

/** What the model answers per requirement. */
export interface RawRequirement {
  text: string;
  must: boolean;
  skill: string | null;
}

/** Stored on JobMatch.requirements and shown on the match page. */
export interface RequirementItem {
  text: string;
  must: boolean;
  /** The candidate's own skill name, when one fits. */
  skill: string | null;
  result: RequirementResult;
  note: string;
}

export const MAX_REQUIREMENTS = 6;

/**
 * Whether two skill names mean the same skill, forgiving case, punctuation, dots and a plural:
 * "Design system" = "Design systems", "Next.js" = "NextJS", "UX-research" = "UX research".
 */
export function sameSkill(a: string, b: string): boolean {
  return skillKey(a) === skillKey(b) && skillKey(a) !== '';
}

function skillKey(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\.js\b/g, 'js')
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

/** Whether `text` mentions the skill as a word (not inside another word). */
export function mentions(text: string, skill: string): boolean {
  const k = skillKey(skill);
  if (!k) return false;
  const hay = ` ${skillKey(text)} `;
  return hay.includes(` ${k} `) || hay.includes(` ${k}s `);
}

/** Reads the model's requirements, trusting nothing: strings only, short, at most MAX_REQUIREMENTS. */
export function parseRequirements(raw: unknown): RawRequirement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({
      text: typeof r?.text === 'string' ? r.text.replace(/\s+/g, ' ').trim().slice(0, 140) : '',
      must: r?.must !== false,
      skill: typeof r?.skill === 'string' && r.skill.trim() && !/^(null|none|n\/a|-)$/i.test(r.skill.trim()) ? r.skill.trim().slice(0, 60) : null,
    }))
    .filter((r) => r.text.length > 2)
    .slice(0, MAX_REQUIREMENTS);
}

/** Decides each requirement from the profile's skills and the CVs' text. */
export function classifyRequirements(reqs: RawRequirement[], skills: string[], cvTexts: string[]): RequirementItem[] {
  const cv = cvTexts.join('\n');
  return reqs.map((r) => {
    const base = { text: r.text, must: r.must };
    const own = r.skill ? skills.find((s) => sameSkill(s, r.skill!)) : undefined;
    if (own) {
      return mentions(cv, own)
        ? { ...base, skill: own, result: 'covered' as const, note: 'In your skills and CV' }
        : { ...base, skill: own, result: 'partial' as const, note: 'In your skills, but no CV shows it' };
    }
    // The model named something that isn't a profile skill: only the CV can back it.
    if (r.skill && mentions(cv, r.skill)) {
      return { ...base, skill: null, result: 'partial' as const, note: `“${r.skill}” is in your CV but not in your skills` };
    }
    return { ...base, skill: null, result: 'gap' as const, note: r.must ? 'Not in your profile — don’t claim it' : 'Not in your profile (nice to have)' };
  });
}

const RESULT_VALUE: Record<RequirementResult, number> = { covered: 1, partial: 0.6, gap: 0 };

/** 0-100 coverage, must-haves counting double; null when there's too little to judge. */
export function coverageScore(items: RequirementItem[]): number | null {
  if (items.length < 3) return null;
  let got = 0;
  let max = 0;
  for (const it of items) {
    const w = it.must ? 2 : 1;
    max += w;
    got += w * RESULT_VALUE[it.result];
  }
  return max ? Math.round((got / max) * 100) : null;
}

/** The skills sub-score: half the model's judgement, half the code's coverage (when there is enough). */
export function blendSkills(ai: number, items: RequirementItem[]): number {
  const code = coverageScore(items);
  if (code == null) return ai;
  let s = Math.round(ai * 0.5 + code * 0.5);
  // Two or more missing must-haves: the model can't talk the score up.
  const missingMust = items.filter((i) => i.must && i.result === 'gap').length;
  if (missingMust >= 2) s = Math.min(s, 55);
  return Math.max(0, Math.min(100, s));
}

/** Short names of the must-have gaps, for chips and red flags. */
export function gapNames(items: RequirementItem[] | null | undefined, max = 4): string[] {
  return (items || [])
    .filter((i) => i.result === 'gap')
    .sort((a, b) => Number(b.must) - Number(a.must))
    .map((i) => i.text)
    .filter((t) => t.length <= 40)
    .slice(0, max);
}

export function parseStoredRequirements(raw: unknown): RequirementItem[] | null {
  if (!Array.isArray(raw)) return null;
  const ok = raw.filter(
    (r: any) => typeof r?.text === 'string' && ['covered', 'partial', 'gap'].includes(r?.result),
  ) as RequirementItem[];
  return ok.length ? ok : null;
}
