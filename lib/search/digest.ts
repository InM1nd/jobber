/**
 * What the scorer reads about a job. Ads usually open with a long company blurb, so the
 * first 1200 characters often hold no requirement at all. This picks the sections that
 * decide fit — requirements first, then the tasks, then the intro — within a budget,
 * plus lines that state salary, place, remote or language. Pure code, no AI.
 */

const REQUIREMENTS = /^(?:#+\s*)?(requirements?|qualifications?|what you('|’)?ll (need|bring)|what (you|we)('|’)?re looking for|what we look for|who you are|about you|your profile|you have|you bring|you are|must[- ]haves?|nice[- ]to[- ]haves?|skills|experience|ideally you|bonus points|anforderungen|dein profil|ihr profil|das bringst du mit|was du mitbringst|was sie mitbringen|qualifikation(en)?|wir erwarten|du hast|du bringst mit)\b/i;
const TASKS = /^(?:#+\s*)?(responsibilities|what you('|’)?ll do|what you will do|your role|the role|your tasks|in this role|day to day|your mission|you will|aufgaben|deine aufgaben|ihre aufgaben|dein job|das erwartet dich|was dich erwartet)\b/i;
const OTHER_HEADING = /^(?:#+\s*)?(benefits|what we offer|perks|why join|about us|who we are|our offer|wir bieten|das bieten wir|unser angebot|benefits & perks|equal opportunit|diversity|how to apply|application process|bewerbung)\b/i;
const SIGNAL = /(€|\$|£|eur\b|salary|gehalt|brutto|gross|per (year|annum|month)|jahresgehalt|remote|hybrid|on-?site|office|relocat|visa|sponsor|german|deutsch|english|englisch|c1|b2|years|jahre)/i;

type Kind = 'intro' | 'req' | 'task' | 'other';

function isHeading(line: string) {
  const t = line.trim();
  return t.length > 0 && t.length <= 70 && !/[.!?]$/.test(t.replace(/:$/, ''));
}

/** The description as sections, by the headings it uses. */
export function sections(description: string): Array<{ kind: Kind; text: string }> {
  const lines = description.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out: Array<{ kind: Kind; text: string }> = [];
  let cur: { kind: Kind; lines: string[] } = { kind: 'intro', lines: [] };
  const flush = () => { if (cur.lines.length) out.push({ kind: cur.kind, text: cur.lines.join('\n') }); };
  for (const line of lines) {
    const head = isHeading(line) ? line.replace(/:$/, '') : '';
    const kind: Kind | null = head ? (REQUIREMENTS.test(head) ? 'req' : TASKS.test(head) ? 'task' : OTHER_HEADING.test(head) ? 'other' : null) : null;
    if (kind) {
      flush();
      cur = { kind, lines: [line] };
    } else cur.lines.push(line);
  }
  flush();
  return out;
}

/** The parts of a job description that decide fit, within `budget` characters, on one line. */
export function jobDigest(description: string, budget = 1600): string {
  const text = description.trim();
  if (text.length <= budget) return text.replace(/\s+/g, ' ');
  const parts = sections(text);
  const of = (k: Kind) => parts.filter((p) => p.kind === k).map((p) => p.text).join('\n');
  const req = of('req');
  const task = of('task');
  // No headings found: keep the start, plus lines that look like requirements (bullets with years/skills).
  if (!req && !task) {
    const bullets = text.split('\n').filter((l) => /^\s*[-•*·]/.test(l) || SIGNAL.test(l)).join('\n');
    return clip([[text, 0.55], [bullets, 0.45]], budget);
  }
  const signals = of('intro').split('\n').concat(of('other').split('\n')).filter((l) => SIGNAL.test(l) && l.length < 200).join('\n');
  return clip([[req, 0.55], [task, 0.22], [of('intro'), 0.13], [signals, 0.1]], budget);
}

/** Joins parts, each cut to its share; unused share goes to the parts after it. */
function clip(parts: Array<[string, number]>, budget: number): string {
  let spare = 0;
  const out: string[] = [];
  parts.forEach(([t, share], i) => {
    const room = Math.floor(budget * share) + spare;
    const clean = t.replace(/\s+/g, ' ').trim();
    const piece = clean.slice(0, room);
    spare = room - piece.length;
    if (i === parts.length - 1) spare = 0;
    if (piece) out.push(piece);
  });
  return out.join(' … ').slice(0, budget + 20);
}

// ---------------------------------------------------------------------------
// Language levels (CEFR): what the ad asks for vs what the candidate has.

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const LEVEL_OF: Record<string, number> = { basic: 1, good: 3, fluent: 4, native: 5 };

/** The candidate's level (0-5, A1-C2) in a language from profile strings like "German (A2)" or "English (Fluent)"; -1 if absent. */
export function candidateLevel(languages: string[], lang: 'german' | 'english'): number {
  const re = lang === 'german' ? /german|deutsch/i : /english|englisch/i;
  const entry = languages.find((l) => re.test(l));
  if (!entry) return -1;
  const cefr = entry.toUpperCase().match(/\b([ABC][12])\b/);
  if (cefr) return CEFR.indexOf(cefr[1] as (typeof CEFR)[number]);
  const word = entry.toLowerCase().match(/basic|beginner|elementary|good|intermediate|fluent|proficient|advanced|business|native|mother/);
  if (!word) return 3;
  const w = word[0];
  return /basic|beginner|elementary/.test(w) ? LEVEL_OF.basic : /good|intermediate/.test(w) ? LEVEL_OF.good : /native|mother/.test(w) ? LEVEL_OF.native : LEVEL_OF.fluent;
}

/**
 * What the ad asks for in a language: the level (0-5) and whether it's optional.
 * null when the ad doesn't mention it. A German ad with no stated level implies B2.
 */
export function requiredLevel(description: string, lang: 'german' | 'english'): { level: number; optional: boolean } | null {
  const t = description.slice(0, 8000);
  const name = lang === 'german' ? '\\b(?:german|deutsch(?:kenntnisse)?)\\b' : '\\b(?:english|englisch(?:kenntnisse)?)\\b';
  const near = new RegExp(`[^.\\n]{0,60}${name}[^.\\n]{0,60}`, 'gi');
  const hits = t.match(near) || [];
  if (!hits.length) {
    if (lang === 'german' && (t.match(/\b(und|wir|sie|mit|für|eine?n?|dein|deine|ihre|bei|uns|aufgaben|kenntnisse|erfahrung)\b/gi) || []).length >= 12) {
      return { level: 3, optional: false };
    }
    return null;
  }
  let best: { level: number; optional: boolean } | null = null;
  for (const h of hits) {
    const optional = /(plus|nice to have|advantage|bonus|beneficial|von vorteil|wünschenswert|ideally|preferred|optional)/i.test(h);
    const cefr = h.toUpperCase().match(/\b([ABC][12])\b/);
    const level = cefr
      ? CEFR.indexOf(cefr[1] as (typeof CEFR)[number])
      : /native|mother tongue|muttersprach/i.test(h)
        ? 5
        : /fluent|fließend|fliessend|verhandlungssicher|excellent|sehr gut|business|proficien|exzellent|strong/i.test(h)
          ? 4
          : /good|gute|solid/i.test(h)
            ? 3
            : /basic|grundkenntnisse|some/i.test(h)
              ? 1
              : 3;
    // A required mention outweighs a "plus"; among the same kind the highest level counts.
    if (!best || (best.optional && !optional) || (best.optional === optional && level > best.level)) best = { level, optional };
  }
  return best;
}

/** 0-100: how well the candidate's languages meet the ad's German and English asks. */
export function languageFit(languages: string[], description: string): number {
  let score = 100;
  for (const lang of ['german', 'english'] as const) {
    const need = requiredLevel(description, lang);
    if (!need) continue;
    const have = candidateLevel(languages, lang);
    const gap = need.level - have; // not speaking it at all (-1) is the widest gap
    const s = gap <= 0 ? 100 : need.optional ? (gap === 1 ? 88 : 75) : gap === 1 ? 60 : gap === 2 ? 35 : 15;
    score = Math.min(score, s);
  }
  return score;
}
