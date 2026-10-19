import { parseJsonLoose } from '@/lib/ai/gemini';
import { runAi } from '@/lib/ai/run';
import type { FormQuestion, FormSource } from './questions';

import { parseDrafts, type ApplicationDrafts, type DraftItem } from './format';
export { parseDrafts, type ApplicationDrafts, type DraftItem };

/** Facts the drafts may state (owner-confirmed). Kept in code so answers never drift. */
export const FIXED_FACTS = `- Name: Oleksandr Zabolotnyi (sign "Oleksandr").
- Based in Vienna, Austria. Current job: Frontend Developer & Designer at marswalk media (always lowercase "marswalk media"), Vienna, since September 2025; contract ends 31 Oct 2026.
- Available from 1 November 2026 (no notice period beyond that).
- Work permit: Austrian RWR+ card (Rot-Weiß-Rot – Karte plus) — can work in Austria, no sponsorship needed in Austria. Do not claim EU citizenship or a right to work in other countries.
- Salary expectation: €60,000–70,000 gross per year.
- Languages: English fluent, German A2 (basic), Ukrainian and Russian native. Working language should be English.
- Links: LinkedIn https://www.linkedin.com/in/oleksandr-zabolotnyi1/ · GitHub https://github.com/InM1nd · Portfolio https://inm1nd.vercel.app
- How he found roles: the company's careers page / job board (say "your careers page" unless notes say otherwise).`;

const STYLE = `Writing rules (approved by the candidate):
- Cover letter: exactly 3 short paragraphs, 120–200 words total. Opening hook tied to the company's product (not "I am excited to apply"). One concrete story from the CV with a real detail. Close with Vienna + available from 1 November 2026. Sign off "Best,\\nOleksandr".
- Form answers: 2–5 sentences each, plain and direct. Short factual questions (salary, notice, permit, links, German, location, how heard) get one or two sentences.
- Choice / yes-no questions: answer with exactly one of the given options (verbatim) when one is true, then nothing else; if none is clearly true from the facts, write "[check: …]" with what to verify.
- Only real facts from the CV, profile and fixed facts. Never invent employers, numbers, degrees, years, skills or certificates. If a question needs a fact you don't have, write "[fill in: …]".
- No clichés ("passionate", "fast-paced", "team player", "I hope", "leverage"), no bold, no bullet lists, no emoji, no em-dash chains.
- Write in English (German only if the question itself is in German).`;

export function draftsPrompt(input: {
  company: string; role: string; description: string; cvText: string; writingRules: string | null; notes: string | null; questions: FormQuestion[];
}) {
  const qs = input.questions.map((q) => ({ id: q.id, question: q.label.replace('{company}', input.company), type: q.kind, ...(q.options ? { options: q.options } : {}) }));
  return `Draft answers for a job application form. Drafts only; the candidate reviews and submits them himself.

Company: ${input.company}
Role: ${input.role}
Job description:
"""${input.description.slice(0, 6000)}"""

Candidate CV:
"""${input.cvText.slice(0, 7000)}"""

Fixed facts:
${FIXED_FACTS}
${input.writingRules ? `\nCandidate's own writing rules:\n"""${input.writingRules.slice(0, 3000)}"""\n` : ''}${input.notes ? `\nTracker notes (facts; may be Russian):\n"""${input.notes.slice(0, 1500)}"""\n` : ''}
${STYLE}

Questions (JSON):
${JSON.stringify(qs)}

Return JSON only: {"answers":[{"id":"<question id>","answer":"<text>"}]} with one entry per question, same ids. In the cover letter, separate the 3 paragraphs with \\n\\n and put the sign-off on its own lines (\\n\\nBest,\\nOleksandr).`;
}

export function mergeAnswers(questions: FormQuestion[], raw: unknown, company: string): DraftItem[] {
  const list = ((raw as { answers?: unknown[] })?.answers || []) as Array<{ id?: unknown; answer?: unknown }>;
  const byId = new Map(list.map((a) => [String(a.id), String(a.answer ?? '').trim()]));
  return questions.map((q) => ({ ...q, label: q.label.replace('{company}', company), answer: clean(byId.get(q.id) || '') }));
}

export const clean = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/Marswalk Media/g, 'marswalk media')
    // Sign-off always on its own lines.
    .replace(/\s*(Best|Kind regards|Best regards),\s*\n?\s*Oleksandr\s*$/i, '\n\nBest,\nOleksandr')
    .trim();

export async function generateDrafts(userId: string, input: Parameters<typeof draftsPrompt>[0], source: FormSource): Promise<ApplicationDrafts> {
  const reply = await runAi(userId, 'write', draftsPrompt(input), {
    tier: 'lite', json: true, temperature: 0.4, maxTokens: 3500, maxWaitMs: 40_000,
    system: 'You draft honest, specific job-application answers for one candidate. You never invent facts.',
  });
  return { v: 1, source, generatedAt: new Date().toISOString(), items: mergeAnswers(input.questions, parseJsonLoose(reply), input.company) };
}
