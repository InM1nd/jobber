/**
 * Application-form questions for a job, from the ATS's own public data where it exposes it:
 * - Greenhouse: boards-api.greenhouse.io/v1/boards/<board>/jobs/<id>?questions=true
 * - Recruitee:  <company>.recruitee.com/api/offers/  (open_questions per offer)
 * - Workable:   apply.workable.com/api/v1/jobs/<shortcode>/form
 * Ashby, Lever, Personio, SmartRecruiters, JOIN don't publish their forms → standard set.
 * Contact/identity/file fields (name, email, phone, CV upload…) are dropped: nothing to draft there.
 */

export type QuestionKind = 'text' | 'choice' | 'multi' | 'boolean';
export interface FormQuestion {
  id: string;
  label: string;
  kind: QuestionKind;
  required: boolean;
  options?: string[];
}
export type FormSource = 'greenhouse' | 'recruitee' | 'workable' | 'standard';

export const STANDARD_QUESTIONS: FormQuestion[] = [
  { id: 'cover_letter', label: 'Cover letter', kind: 'text', required: false },
  { id: 'why_company', label: 'Why do you want to work at {company}?', kind: 'text', required: false },
  { id: 'salary', label: 'What are your salary expectations?', kind: 'text', required: false },
  { id: 'availability', label: 'What is your notice period / earliest start date?', kind: 'text', required: false },
  { id: 'work_permit', label: 'Are you authorised to work in Austria / the EU?', kind: 'text', required: false },
  { id: 'location', label: 'Where are you based? Are you open to working on site / hybrid?', kind: 'text', required: false },
  { id: 'links', label: 'LinkedIn, GitHub, portfolio', kind: 'text', required: false },
  { id: 'german', label: 'What is your level of German?', kind: 'text', required: false },
  { id: 'heard', label: 'How did you hear about this role?', kind: 'text', required: false },
];

const SKIP = /^(first|last|full|preferred)?\s*name\b|^(e-?mail|phone|mobile|telefon|address|adresse|photo|foto|headline|resume|cv\b|résumé|education|experience|summary)$|resume\/cv|^(linkedin|website|github)( profile| url)?$/i;
const keep = (label: string, type: string) => !SKIP.test(label.trim()) && !/^(input_file|file|group|email|phone)$/.test(type);

export function parseGreenhouseQuestions(data: any): FormQuestion[] {
  const out: FormQuestion[] = [];
  for (const q of data?.questions || []) {
    const f = (q.fields || []).find((x: any) => x.type !== 'input_file') || q.fields?.[0];
    if (!f) continue;
    const label = String(q.label || '').trim();
    // Cover letter: file or textarea — keep as text (we draft it).
    if (/cover letter/i.test(label)) { out.push({ id: f.name || 'cover_letter', label: 'Cover letter', kind: 'text', required: !!q.required }); continue; }
    if (!label || !keep(label, f.type)) continue;
    const options = (f.values || []).map((v: any) => String(v.label)).filter(Boolean);
    const kind: QuestionKind = f.type === 'multi_value_multi_select' ? 'multi' : f.type === 'multi_value_single_select' ? (options.join('|').match(/^(yes\|no|no\|yes)$/i) ? 'boolean' : 'choice') : 'text';
    out.push({ id: String(f.name || label), label, kind, required: !!q.required, ...(options.length ? { options } : {}) });
  }
  return out;
}

export function parseRecruiteeQuestions(offer: any): FormQuestion[] {
  return (offer?.open_questions || []).map((q: any) => {
    const options = (q.open_question_options || []).map((o: any) => String(o.body));
    const kind: QuestionKind = q.kind === 'single_choice' ? 'choice' : q.kind === 'multi_choice' ? 'multi' : q.kind === 'boolean' ? 'boolean' : 'text';
    return { id: String(q.id), label: String(q.body || '').trim(), kind, required: !!q.required, ...(options.length ? { options } : {}) };
  }).filter((q: FormQuestion) => q.label && q.kind !== ('file' as QuestionKind));
}

export function parseWorkableForm(sections: any): FormQuestion[] {
  const out: FormQuestion[] = [];
  for (const s of Array.isArray(sections) ? sections : []) {
    for (const f of s.fields || []) {
      const label = String(f.label || '').trim();
      if (/cover letter/i.test(label)) { out.push({ id: String(f.id), label: 'Cover letter', kind: 'text', required: !!f.required }); continue; }
      if (!label || !keep(label, f.type) || !/^(text|paragraph|boolean|dropdown|multiple|select|radio|checkbox|short_text|long_text|number|date)/.test(f.type)) continue;
      const options = (f.choices || []).map((c: any) => String(c.body || c.name || c.label)).filter(Boolean);
      const kind: QuestionKind = f.type === 'boolean' ? 'boolean' : f.type === 'multiple' || f.type === 'checkbox' ? 'multi' : options.length ? 'choice' : 'text';
      out.push({ id: String(f.id), label, kind, required: !!f.required, ...(options.length ? { options } : {}) });
    }
  }
  return out;
}

/** Which ATS + ids a job URL / source points to. */
export function atsRef(input: { url?: string | null; sourceType?: string | null; sourceUrl?: string | null; externalId?: string | null }) {
  const url = input.url || '';
  const gh = url.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([\w-]+)\/jobs\/(\d+)/i) || url.match(/[?&]gh_jid=(\d+)/i);
  if (input.sourceType === 'greenhouse' && input.sourceUrl && input.externalId) {
    const board = input.sourceUrl.match(/boards\/([\w-]+)/)?.[1];
    if (board) return { ats: 'greenhouse' as const, board, id: input.externalId };
  }
  if (gh && gh.length === 3) return { ats: 'greenhouse' as const, board: gh[1], id: gh[2] };
  const wk = url.match(/apply\.workable\.com\/(?:[\w-]+\/)?j\/([A-Z0-9]{6,12})/i);
  if (wk) return { ats: 'workable' as const, id: wk[1].toUpperCase() };
  const rc = url.match(/https?:\/\/([\w-]+)\.recruitee\.com\/o\/([\w-]+)/i);
  if (rc) return { ats: 'recruitee' as const, company: rc[1], slug: rc[2], id: input.sourceType === 'recruitee' ? input.externalId || null : null };
  return null;
}

const get = async (u: string) => {
  const r = await fetch(u, { headers: { 'user-agent': 'JobberBot/1.0 (personal job search)', accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/** Real questions when the ATS exposes them, else the standard set. Never throws. */
export async function fetchQuestions(input: Parameters<typeof atsRef>[0]): Promise<{ source: FormSource; questions: FormQuestion[] }> {
  const ref = atsRef(input);
  try {
    if (ref?.ats === 'greenhouse') {
      const q = parseGreenhouseQuestions(await get(`https://boards-api.greenhouse.io/v1/boards/${ref.board}/jobs/${ref.id}?questions=true`));
      if (q.length) return { source: 'greenhouse', questions: withCover(q) };
    }
    if (ref?.ats === 'workable') {
      const q = parseWorkableForm(await get(`https://apply.workable.com/api/v1/jobs/${ref.id}/form`));
      if (q.length) return { source: 'workable', questions: withCover(q) };
    }
    if (ref?.ats === 'recruitee') {
      const data = await get(`https://${ref.company}.recruitee.com/api/offers/`);
      const offer = (data.offers || []).find((o: any) => o.slug === ref.slug || String(o.id) === ref.id);
      const q = parseRecruiteeQuestions(offer);
      if (q.length) return { source: 'recruitee', questions: withCover(q) };
    }
  } catch {
    /* fall back to the standard set */
  }
  return { source: 'standard', questions: STANDARD_QUESTIONS };
}

/** Real forms often have no cover-letter field; we still draft one first. */
function withCover(q: FormQuestion[]) {
  return q.some((x) => x.label === 'Cover letter') ? q : [{ id: 'cover_letter', label: 'Cover letter', kind: 'text' as const, required: false }, ...q];
}
