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

/** An outside agent (Grok bot, Claude) sent this job in via /api/agent/jobs. */
export interface AgentFind {
  /** "grok", "claude"… */
  by: string;
  at: string;
  /** The agent's own reason, shown as its opinion, never mixed into Jobber's score. */
  note?: string;
  /** The agent's own 0-100 guess. */
  score?: number;
}

export interface AiMeta {
  letter?: OutputMeta;
  advice?: OutputMeta;
  tailoredCv?: OutputMeta;
  /** Earlier versions of the cover letter, newest first. */
  letterHistory?: LetterVersion[];
  agent?: AgentFind;
  /** Second look by the stronger model: when, and the flash-lite score it replaced. */
  verified?: { at: string; before: number };
  /** The user's decision in Review (lib/tracker/decide.ts). */
  swipe?: SwipeDecision;
  /** 2-3 short lines from the scorer: what you'd do, the offer if stated (Review card). */
  gist?: string[];
}

export interface SwipeDecision {
  d: 'apply' | 'skip' | 'later';
  at: string;
  /** Why it was skipped (lib/tracker/skip.ts reasons). */
  reason?: string;
  /** Later: back in the deck after this. */
  until?: string;
  /** Apply: the tracker row, and whether the swipe created it (Undo only deletes what it made). */
  appId?: string;
  created?: boolean;
  /** Skip: red flags before, restored by Undo. */
  prevFlags?: string[];
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
  const gist = strings(r.gist)?.slice(0, 3).map((s) => s.slice(0, 120));
  if (gist?.length) meta.gist = gist;
  const sw = r.swipe as Partial<SwipeDecision> | null | undefined;
  if (sw && (sw.d === 'apply' || sw.d === 'skip' || sw.d === 'later') && typeof sw.at === 'string') {
    meta.swipe = {
      d: sw.d,
      at: sw.at,
      ...(typeof sw.reason === 'string' ? { reason: sw.reason.slice(0, 60) } : {}),
      ...(typeof sw.until === 'string' ? { until: sw.until } : {}),
      ...(typeof sw.appId === 'string' ? { appId: sw.appId } : {}),
      ...(typeof sw.created === 'boolean' ? { created: sw.created } : {}),
      ...(strings(sw.prevFlags) ? { prevFlags: strings(sw.prevFlags) } : {}),
    };
  }
  const ver = r.verified as { at?: unknown; before?: unknown } | null | undefined;
  if (ver && typeof ver.at === 'string' && typeof ver.before === 'number') meta.verified = { at: ver.at, before: ver.before };
  const a = r.agent as Partial<AgentFind> | null | undefined;
  if (a && typeof a.by === 'string' && typeof a.at === 'string') {
    meta.agent = {
      by: a.by.slice(0, 40),
      at: a.at,
      ...(typeof a.note === 'string' && a.note ? { note: a.note.slice(0, 2000) } : {}),
      ...(typeof a.score === 'number' && Number.isFinite(a.score) ? { score: a.score } : {}),
    };
  }
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
