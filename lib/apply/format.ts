import type { FormQuestion, FormSource } from './questions';

/** Saved on Application.coverLetter as JSON (no schema change). Plain text there = an old cover letter. */
export interface DraftItem extends FormQuestion {
  answer: string;
  /** Fact guard: names/numbers in the answer that the CV, facts and job post don't back. */
  unverified?: string[];
}
export interface ApplicationDrafts {
  v: 1;
  source: FormSource;
  generatedAt: string;
  editedAt?: string;
  /** Prompt version that wrote them (lib/ai/meta.ts PROMPT_VERSIONS.drafts). */
  promptVersion?: string;
  items: DraftItem[];
}

export function parseDrafts(raw: string | null | undefined): ApplicationDrafts | null {
  if (!raw) return null;
  if (raw.trim().startsWith('{')) {
    try {
      const d = JSON.parse(raw);
      if (d?.v === 1 && Array.isArray(d.items)) return d as ApplicationDrafts;
    } catch {}
  }
  return { v: 1, source: 'standard', generatedAt: '', items: [{ id: 'cover_letter', label: 'Cover letter', kind: 'text', required: false, answer: raw }] };
}

