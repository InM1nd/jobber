import { OTHER_HEADING, REQUIREMENTS, TASKS } from '@/lib/search/digest';
import type { SalaryRange } from '@/lib/sources/salary';

/**
 * A job ad laid out for reading: what you'd do, what they want, what they offer, about the company —
 * as short bullet points, repeats and board boilerplate removed. Many sources send the ad as one
 * run-on paragraph, so inline headings ("What you'll do Shape the…") are split out first. Pure, no AI.
 */

export type ReadableKind = 'task' | 'req' | 'offer' | 'about' | 'other';
export interface ReadableSection {
  kind: ReadableKind;
  title: string;
  items: string[];
}

export const SECTION_TITLE: Record<ReadableKind, string> = {
  task: 'What you’d do',
  req: 'What they’re looking for',
  offer: 'What they offer',
  about: 'About the company',
  other: 'More',
};
const ORDER: ReadableKind[] = ['task', 'req', 'offer', 'other', 'about'];
const MAX_ITEMS = 8;

/** Headings that ads glue into running text. Matched only at a sentence start, followed by a capital or a colon. */
const INLINE_HEADINGS = [
  'About the role', 'About the job', 'About the team', 'About the position', 'About us', 'About you',
  'What you(?:\'|’)?ll do', 'What you will do', 'What you(?:\'|’)?ll need', 'What you(?:\'|’)?ll bring', 'What we(?:\'|’)?re looking for',
  'What we offer', 'What we look for', 'Who you are', 'Your role', 'The role', 'Your tasks', 'Your profile', 'Responsibilities',
  'Requirements', 'Qualifications', 'Nice to have', 'Nice-to-have', 'Bonus points', 'Benefits', 'Perks', 'Pay', 'Compensation',
  'Salary', 'Why join us', 'Why join', 'How to apply', 'Ihre Aufgaben', 'Deine Aufgaben', 'Ihr Profil', 'Dein Profil', 'Wir bieten',
  'Das bieten wir', 'Was wir bieten', 'Aufgaben', 'Anforderungen',
];
const INLINE = new RegExp(`(^|[.!?:)…]\\s+)(${INLINE_HEADINGS.join('|')}|About [A-Z][\\w&.'’-]+)(?=:|\\s+[A-Z0-9•])`, 'g');

const OFFER = /^(?:#+\s*)?(benefits|what we offer|perks|our offer|wir bieten|das bieten wir|was wir bieten|unser angebot|pay|compensation|salary)\b/i;
const ABOUT = /^(?:#+\s*)?(about (?!you\b|the role\b|the job\b|the position\b)|who we are|why join)/i;
const DROP = /^(?:#+\s*)?(equal opportunit|diversity|how to apply|application process|bewerbung)/i;
/** Board footers glued to the last sentence: cut the phrase, keep the rest of the line. */
const FOOTER = /\s*find more [^.\n]{0,80}?jobs?\b[^.\n]{0,60}?\bon \w+\.?/gi;
/** "Pay" / "Salary" right after a bullet, with no full stop before it. */
const PAY = /\s(Pay|Compensation|Salary)(?=\s+(?:UK|US|EU|€|\$|£|\d))/g;
const BOILERPLATE = [
  /^apply (now|here|today)\b/i,
  /^listed on .{2,60}\(found through google for jobs\)\.?$/i,
  /^(share|save) (this )?job$/i,
];
const BULLET = /^\s*(?:[-•*·–▪◦]|\d{1,2}[.)])\s+/;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim().slice(0, 90);

function kindOf(heading: string): ReadableKind | 'drop' | null {
  if (DROP.test(heading)) return 'drop';
  if (TASKS.test(heading)) return 'task';
  if (REQUIREMENTS.test(heading)) return 'req';
  if (OFFER.test(heading)) return 'offer';
  if (ABOUT.test(heading)) return 'about';
  if (OTHER_HEADING.test(heading)) return 'other';
  return null;
}

/** Splits glued headings and bullets onto their own lines. */
export function unglue(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(FOOTER, '')
    .replace(/\s*[•▪◦]\s*/g, '\n• ')
    .replace(INLINE, (_m, pre: string, head: string) => `${pre.trimEnd()}\n${head}\n`)
    .replace(PAY, '\n$1\n')
    .replace(/\n{3,}/g, '\n\n');
}

function itemsOf(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(BULLET, '').replace(/\s+/g, ' ').trim();
    if (line.length < 3) continue;
    // A long run-on line reads better as sentences.
    if (line.length > 160) out.push(...line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter((s) => s.length > 2));
    else out.push(line);
  }
  return out;
}

export function readableJob(description: string | null | undefined): ReadableSection[] {
  const text = unglue(description || '');
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !BOILERPLATE.some((re) => re.test(l)));

  const raw: Array<{ kind: ReadableKind | 'drop'; title: string; lines: string[] }> = [];
  let cur: (typeof raw)[number] = { kind: 'about', title: '', lines: [] };
  let headings = 0;
  for (const line of lines) {
    const t = line.replace(/:$/, '').trim();
    const kind = t.length <= 70 && !/[.!?]$/.test(t) ? kindOf(t) : null;
    if (kind) {
      if (cur.lines.length) raw.push(cur);
      cur = { kind, title: kind === 'other' ? t : '', lines: [] };
      headings++;
    } else cur.lines.push(line);
  }
  if (cur.lines.length) raw.push(cur);
  // No headings at all: one plain section, not "About the company".
  if (!headings && raw.length) raw[0].kind = 'other';

  const seen = new Set<string>();
  const merged = new Map<ReadableKind, ReadableSection>();
  for (const s of raw) {
    if (s.kind === 'drop') continue;
    // Ads repeat their pitch: drop any sentence already shown, even inside a longer item.
    const items = itemsOf(s.lines)
      .map((it) => it.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter((sentence) => {
        const k = key(sentence);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      }).join(' '))
      .filter(Boolean);
    if (!items.length) continue;
    const prev = merged.get(s.kind);
    if (prev) prev.items.push(...items);
    else merged.set(s.kind, { kind: s.kind, title: s.kind === 'other' && s.title ? s.title : SECTION_TITLE[s.kind], items });
  }
  return ORDER.filter((k) => merged.has(k)).map((k) => {
    const s = merged.get(k)!;
    return { ...s, title: s.kind === 'other' && !headings ? 'Description' : s.title, items: s.items.slice(0, MAX_ITEMS) };
  });
}

/** The first salary range written in the text (in the order it appears), for ads that don't send one. */
export function salaryFromText(text: string | null | undefined): SalaryRange {
  if (!text) return {};
  const found: Array<{ at: number; r: SalaryRange }> = [];
  for (const [currency, sym] of [['EUR', '€'], ['USD', '\\$'], ['GBP', '£']] as const) {
    const re = new RegExp(`${sym}\\s*(\\d[\\d.,]*)\\s*([kK])?\\s*(?:-|–|to)\\s*${sym}?\\s*(\\d[\\d.,]*)\\s*([kK])?`);
    const m = re.exec(text);
    if (!m) continue;
    const n = (v: string, k: string | undefined) => {
      const x = Number.parseInt(v.replace(/[.,\s]/g, ''), 10);
      return k || x < 1000 ? x * 1000 : x;
    };
    const min = n(m[1], m[2]);
    const max = n(m[3], m[4]);
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 10_000 && max >= min) found.push({ at: m.index, r: { min, max, currency } });
  }
  return found.sort((a, b) => a.at - b.at)[0]?.r ?? {};
}
