/**
 * Why a job was skipped, kept as one "Skipped: …" line at the top of the application's notes
 * (no extra column; editable like any note). Scoring calibration reads it, so a skip teaches
 * *what* was wrong, not only that something was. Pure: safe for client code.
 */
export const SKIP_REASONS = ['Level', 'Stack', 'Language', 'Location', 'Salary', 'Company', 'Role type', 'Contract'] as const;

const LINE = /^Skipped: (.{1,60})$/m;

export function skipReasonOf(notes: string | null | undefined): string | null {
  return notes?.match(LINE)?.[1]?.trim() || null;
}

/** Notes with the reason line set (replaced if there was one), or removed when reason is null. */
export function withSkipReason(notes: string | null | undefined, reason: string | null): string {
  const rest = (notes || '').replace(new RegExp(`${LINE.source}\\n?`, 'm'), '').trim();
  return reason ? [`Skipped: ${reason}`, rest].filter(Boolean).join('\n') : rest;
}
