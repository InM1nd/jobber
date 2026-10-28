import { runAi } from '@/lib/ai/run';
import { factsForPrompt, firstName } from '@/lib/profile/facts';
import { factSources, unverifiedFacts } from '@/lib/ai/fact-guard';
export { followUpPlan } from './followup-plan';

const STYLE = `Follow-up style (approved by the candidate):
- Short: 3-5 sentences, under 90 words. Plain, friendly words. No "I hope this finds you well", no "circle back", no "just following up", no bold, no lists, no emoji.
- Only real facts from the notes and application data. Never invent interviews, contacts, numbers or skills.
- One concrete detail about the company or the role (from the data given) that shows real interest.
- A clear, easy next step (e.g. happy to share more / a short call), no pressure.
- Sign off exactly: "Best," and the candidate's first name on its own line, unless the writing rules say otherwise.`;

export async function draftFollowUp(
  userId: string,
  input: { company: string; role: string; appliedAt: string | null; notes: string | null; whyFit: string | null; channel: string; count: number; writingRules: string | null; fullName: string | null; facts?: string | null },
) {
  const prompt = `Write a follow-up message for a job application. Channel: ${input.channel}. This is follow-up #${input.count + 1}.
Company: ${input.company}
Role: ${input.role}
Applied: ${input.appliedAt ? input.appliedAt.slice(0, 10) : 'unknown'}
Why it fits (from the tracker): ${input.whyFit || 'n/a'}
Notes (facts you may use, may be in Russian; write the message in English): """${(input.notes || '').slice(0, 2500)}"""
Candidate name: ${input.fullName || '[fill in: name]'}${firstName(input.fullName) ? ` (sign as ${firstName(input.fullName)})` : ''}
${factsForPrompt(input.facts)}
${input.writingRules ? `Candidate writing rules:\n${input.writingRules.slice(0, 2500)}\n` : ''}
${input.channel === 'email' ? 'Start with a one-line "Subject: ..." then a blank line, then the message.' : 'No subject line.'}
Return only the message text.`;
  const reply = await runAi(userId, 'write', prompt, { tier: 'lite', system: `You write short, honest job-search follow-ups.\n${STYLE}`, temperature: 0.4, maxTokens: 600, maxWaitMs: 20_000 });
  return reply.trim().replace(/^```\w*\n?|```$/g, '').trim();
}

/** Fact guard for a follow-up: only the application data, notes and facts back it. */
export function followUpUnverified(
  draft: string,
  input: { company: string; role: string; appliedAt: string | null; notes: string | null; whyFit: string | null; fullName: string | null; facts?: string | null; extra?: string[] },
) {
  return unverifiedFacts(draft, factSources([input.company, input.role, input.appliedAt, input.notes, input.whyFit, input.fullName, input.facts, ...(input.extra || [])]));
}
