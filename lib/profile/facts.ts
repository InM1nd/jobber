/**
 * "Facts about me": things that are true about the candidate but rarely in a CV
 * (availability, work permit, salary expectation, links, how to spell a company name).
 * One per line, written by the user. The AI may state them; the fact guard trusts them.
 * Idea from AienTech/dossier ("Facts about me"), written for Jobber.
 */

export const MAX_FACTS_CHARS = 4000;

/** The facts as clean lines, bullets and blanks dropped. */
export function factLines(text: string | null | undefined): string[] {
  return (text || '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/** The facts for a prompt, or a line saying there are none (so the model writes "[fill in: …]"). */
export function factsForPrompt(text: string | null | undefined): string {
  const lines = factLines(text);
  return lines.length
    ? `Facts about the candidate (from the candidate, true; use them where they help, in your own words):\n${lines.map((l) => `- ${l}`).join('\n')}`
    : 'Facts about the candidate: none given. Anything not in the CV (availability, work permit, salary, links) is unknown: write "[fill in: …]".';
}

/** The first name to sign with, or null when the profile has none. */
export function firstName(fullName: string | null | undefined): string | null {
  return fullName?.trim().split(/\s+/)[0] || null;
}
