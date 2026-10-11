import { z } from 'zod';
import { parseJsonLoose } from './gemini';
import { runAi } from './run';

const items = (max: number) =>
  z.array(z.unknown()).catch([]).transform((a) =>
    a.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim().slice(0, 300)).slice(0, max),
  );

export const CvAdviceSchema = z.object({
  verdict: z.unknown().optional().transform((v) => (typeof v === 'string' ? v.trim().slice(0, 400) : '')),
  emphasize: items(6),
  add: items(6),
  reword: z
    .array(z.unknown())
    .catch([])
    .transform((a) =>
      a
        .map((v) => v as { from?: unknown; to?: unknown })
        .filter((v) => typeof v?.to === 'string' && v.to.trim())
        .map((v) => ({ from: typeof v.from === 'string' ? v.from.trim().slice(0, 300) : '', to: String(v.to).trim().slice(0, 300) }))
        .slice(0, 5),
    ),
  missingKeywords: items(12),
  doNotClaim: items(6),
});
export type CvAdvice = z.infer<typeof CvAdviceSchema>;

export function parseCvAdvice(raw: unknown): CvAdvice {
  return CvAdviceSchema.parse((typeof raw === 'string' ? parseJsonLoose(raw) : raw) ?? {});
}

export interface JobForAdvice {
  title: string;
  company: string;
  description: string;
}

const RULES = `Hard rules:
- Never invent experience, employers, numbers, degrees or skills. Only reorder, emphasise and reword what is in the CV.
- If the job asks for something the CV does not show, put it in "doNotClaim" (do not tell the candidate to add it as experience). They may mention it only as "learning"/"familiar" if the CV supports that.
- Be concrete: quote the CV line you mean.`;

export async function adviseCv(userId: string, cvText: string, job: JobForAdvice): Promise<CvAdvice> {
  const reply = await runAi(userId, 'write', 
    `CV:\n"""\n${cvText.slice(0, 12_000)}\n"""\n\nJob: ${job.title} at ${job.company}\n"""\n${job.description.slice(0, 6_000)}\n"""\n
Return JSON:
{"verdict": one sentence on fit,
 "emphasize": CV points to move up / highlight for this job,
 "add": things that ARE in the CV but missing from the summary/top section for this job (e.g. a project or tool mentioned only once),
 "reword": [{"from": exact CV phrase, "to": better phrasing using the job's vocabulary, same facts}],
 "missingKeywords": job keywords the CV lacks (ATS keywords),
 "doNotClaim": job requirements the CV does not support — do not claim these}`,
    { tier: 'smart', system: `You are a careful CV coach.\n${RULES}`, json: true, temperature: 0.2, maxTokens: 4096, maxWaitMs: 25_000 },
  );
  return parseCvAdvice(reply);
}

export async function tailorCvText(userId: string, cvText: string, job: JobForAdvice): Promise<string> {
  const reply = await runAi(userId, 'write', 
    `CV:\n"""\n${cvText.slice(0, 12_000)}\n"""\n\nTarget job: ${job.title} at ${job.company}\n"""\n${job.description.slice(0, 5_000)}\n"""\n
Rewrite the CV for this job as plain text (no markdown symbols except "- " bullets): a 3-line summary, skills ordered by relevance, experience with the most relevant bullets first. Keep every fact true to the original; drop irrelevant detail rather than adding anything new.`,
    { tier: 'smart', system: `You tailor CVs.\n${RULES}`, temperature: 0.3, maxTokens: 4096, maxWaitMs: 25_000, timeoutMs: 60_000 },
  );
  return reply.trim();
}
