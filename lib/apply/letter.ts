import type { RequirementItem } from '@/lib/search/requirements';

/**
 * Letter helpers: body paragraphs vs the sign-off, swapping one paragraph,
 * and refine suggestions built from the match (no extra AI call).
 * Ideas from AienTech/dossier (units, refine suggestions), written for Jobber.
 */

const SIGN_OFF = /\n\s*\n\s*((?:best|kind regards|best regards|regards|cheers|thanks|viele grüße|beste grüße|mit freundlichen grüßen)[,!]?\s*(?:\n.*)?)$/i;

/** The letter as body paragraphs plus its sign-off ("" when there is none). */
export function splitLetter(letter: string): { paragraphs: string[]; signOff: string } {
  const text = letter.replace(/\r\n/g, '\n').trim();
  const m = SIGN_OFF.exec(text);
  const body = m ? text.slice(0, m.index) : text;
  const signOff = m ? m[1].trim() : '';
  // A greeting on its own line ("Hi Anna,") stays glued to the first paragraph.
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 1 && /^(hi|hello|dear|hallo|liebe[rs]?|sehr geehrte)\b.{0,60}[,!]?$/i.test(paragraphs[0])) {
    paragraphs.splice(0, 2, `${paragraphs[0]}\n\n${paragraphs[1]}`);
  }
  return { paragraphs, signOff };
}

export function joinLetter({ paragraphs, signOff }: { paragraphs: string[]; signOff: string }): string {
  return [...paragraphs, signOff].filter(Boolean).join('\n\n');
}

/** The letter with body paragraph `index` replaced; the model's reply is trimmed to one paragraph. */
export function replaceParagraph(letter: string, index: number, replacement: string): string {
  const parts = splitLetter(letter);
  if (index < 0 || index >= parts.paragraphs.length) return letter;
  const clean = splitLetter(replacement.replace(/^paragraph\s*\d+\s*[:.-]\s*/i, '')).paragraphs.join(' ').replace(/\s+/g, ' ').trim();
  if (!clean) return letter;
  const paragraphs = [...parts.paragraphs];
  // Keep a greeting line that was glued to the first paragraph.
  const greeting = index === 0 && paragraphs[0].includes('\n\n') ? paragraphs[0].split('\n\n')[0] : null;
  paragraphs[index] = greeting && !clean.startsWith(greeting) ? `${greeting}\n\n${clean}` : clean;
  return joinLetter({ ...parts, paragraphs });
}

/** Chips for "Refine": the match's gaps and strengths first, then general ones. */
export function refineChips(requirements: RequirementItem[] | null | undefined, company: string): string[] {
  const reqs = requirements || [];
  const short = (t: string) => (t.length <= 32 ? t : null);
  const strength = reqs.filter((r) => r.result === 'covered' && r.must).map((r) => short(r.skill || r.text)).find(Boolean);
  const gap = reqs.filter((r) => r.result === 'gap' && r.must).map((r) => short(r.text)).find(Boolean);
  const chips = [
    strength ? `Lead with ${strength}` : null,
    gap ? `Address “${gap}” honestly` : null,
    company ? `More specific about ${company.length > 24 ? 'the company' : company}` : null,
    'Shorter',
    'Warmer, less formal',
  ];
  return chips.filter((c): c is string => Boolean(c)).slice(0, 5);
}
