/**
 * What Jobber knows about each AI output on a match, kept in one JSON column (JobMatch.aiMeta):
 * which prompt version wrote it, what the fact guard flagged, and earlier versions of the letter.
 * Ideas from AienTech/dossier (prompt versions, document versions), written for Jobber.
 */

/**
 * Bump a version when its prompt changes in a way that matters: outputs written with an
 * older one are shown as "written with an older prompt" and can be rewritten.
 */
export const PROMPT_VERSIONS = {
  letter: 'letter@2',
  advice: 'advice@2',
  tailoredCv: 'tailor-cv@2',
  drafts: 'drafts@2',
  followUp: 'followup@2',
} as const;
export type AiOutput = keyof typeof PROMPT_VERSIONS;

export type VersionCause = 'generated' | 'rewritten' | 'paragraph' | 'edited' | 'restored' | 'claude' | 'agent';

export interface LetterVersion {
  text: string;
  cause: VersionCause;
  /** e.g. "paragraph 2" or "shorter" */
  detail?: string;
  at: string;
  v?: string;
}

export interface OutputMeta {
  /** Prompt version that wrote it. */
  v: string;
  at: string;
  /** Fact guard flags. */
  unverified?: string[];
  /** How the text came to be (letters). */
  cause?: VersionCause;
  detail?: string;
}

export interface AiMeta {
  letter?: OutputMeta;
  advice?: OutputMeta;
  tailoredCv?: OutputMeta;
  /** Earlier versions of the cover letter, newest first. */
  letterHistory?: LetterVersion[];
}

/** Earlier letter versions kept per match. */
export const MAX_LETTER_VERSIONS = 12;

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 20) : undefined);

function output(raw: unknown): OutputMeta | undefined {
  const r = raw as Partial<OutputMeta> | null;
  if (!r || typeof r.v !== 'string') return undefined;
  const unverified = strings(r.unverified);
  return {
    v: r.v,
    at: typeof r.at === 'string' ? r.at : '',
    ...(unverified?.length ? { unverified } : {}),
    ...(typeof r.cause === 'string' ? { cause: r.cause as VersionCause } : {}),
    ...(typeof r.detail === 'string' ? { detail: r.detail.slice(0, 80) } : {}),
  };
}

export function parseAiMeta(raw: unknown): AiMeta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const history = Array.isArray(r.letterHistory)
    ? (r.letterHistory as LetterVersion[]).filter((h) => typeof h?.text === 'string' && typeof h?.at === 'string').slice(0, MAX_LETTER_VERSIONS)
    : undefined;
  const meta: AiMeta = {};
  for (const k of ['letter', 'advice', 'tailoredCv'] as const) {
    const o = output(r[k]);
    if (o) meta[k] = o;
  }
  if (history?.length) meta.letterHistory = history;
  return meta;
}

/** A fresh output record for `kind`. */
export function stamp(kind: AiOutput, unverified: string[] = [], how?: { cause: VersionCause; detail?: string }): OutputMeta {
  return { v: PROMPT_VERSIONS[kind], at: new Date().toISOString(), ...(unverified.length ? { unverified } : {}), ...(how || {}) };
}

/** Whether a stored output was written with an older prompt (or before versions existed). */
export function isStale(kind: AiOutput, meta: OutputMeta | undefined | null, hasOutput: boolean): boolean {
  return hasOutput && meta?.v !== PROMPT_VERSIONS[kind];
}

/**
 * Keeps the current letter in history before it's replaced, labelled with how it was made.
 * Identical text isn't stored twice.
 */
export function pushLetterVersion(meta: AiMeta, current: string | null | undefined): AiMeta {
  const text = current?.trim();
  if (!text) return meta;
  const history = meta.letterHistory || [];
  if (history[0]?.text === text) return meta;
  const entry: LetterVersion = {
    text,
    cause: meta.letter?.cause || 'generated',
    at: meta.letter?.at || new Date().toISOString(),
    ...(meta.letter?.detail ? { detail: meta.letter.detail } : {}),
    ...(meta.letter?.v ? { v: meta.letter.v } : {}),
  };
  return { ...meta, letterHistory: [entry, ...history].slice(0, MAX_LETTER_VERSIONS) };
}

/** The meta after a new letter replaces `current`. */
export function withNewLetter(meta: AiMeta, current: string | null | undefined, next: OutputMeta): AiMeta {
  return { ...pushLetterVersion(meta, current), letter: next };
}
