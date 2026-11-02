/** Marker red flags on JobMatch rows (no imports, so any module can use them without cycles). */
/** Skipped-list marker for jobs that passed the rules and wait for an AI score. */
export const QUEUED_FLAG = 'Queued for AI scoring';
/** The user swiped it away in Review (lib/tracker/decide.ts). Nothing re-queues it; Undo or "Score anyway" brings it back. */
export const USER_SKIP_FLAG = 'You said: not for me';
/** Red flag on a shown match scored before the profile changed; cleared when it's scored again. */
export const RESCORE_FLAG = 'Your profile changed — re-scoring soon';
