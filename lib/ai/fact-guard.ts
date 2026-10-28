/**
 * Fact guard: after the AI writes a letter or form answers, the names, numbers, years and
 * credentials in the text are checked against what backs them (CVs, "Facts about me",
 * the job post, tracker notes). Anything not found is shown as "check this".
 * Pure code, no AI call. Tuned to stay quiet about what is legitimately there.
 * Idea from AienTech/dossier (fact-guard), written for Jobber.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

const SKIP_WORDS = new Set([
  'i', "i'm", 'i’m', "i've", 'i’ve', "i'd", 'i’d', "i'll", 'i’ll', 'ok',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'subject', 'best', 'regards', 'hi', 'hello', 'dear', 'thanks', 'thank',
  'yes', 'no', 'n/a',
]);

/** Credentials said in words rather than as an acronym. */
const CREDENTIAL = /\b(certified|certification|certificate|licensed|accredited|chartered)\b/gi;

/** A number as people write it: "4,000+", "4 000", "120k", "30%", "2.5", "12". */
const NUMBER = /(?<![\p{L}\p{N}])(\d{1,3}(?:[,.   ]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|m)?%?(?![\p{L}\p{N}])/giu;

const URL = /\bhttps?:\/\/[^\s)\]]+|\b(?:www\.)?[a-z0-9-]+\.(?:com|io|dev|app|at|de|ai|co|net|org|me)(?:\/[^\s)\]]*)?/gi;

/** "[fill in: …]" and "[check: …]" are the model admitting a gap: not claims. */
const PLACEHOLDER = /\[(?:fill in|check)[^\]]*\]/gi;

function numberValue(digits: string, suffix: string | undefined): number {
  const thousands = /^\d{1,3}(?:[,.   ]\d{3})+$/.test(digits);
  const value = thousands ? Number(digits.replace(/[^\d]/g, '')) : Number(digits.replace(',', '.'));
  const scale = suffix?.toLowerCase() === 'k' ? 1_000 : suffix?.toLowerCase() === 'm' ? 1_000_000 : 1;
  return value * scale;
}

function numbersIn(text: string): { raw: string; value: number }[] {
  const found = [...text.matchAll(NUMBER)].map((m) => ({ raw: m[0].trim(), value: numberValue(m[1], m[2]) }));
  for (const m of text.matchAll(/\b([a-z]+)\b/gi)) {
    const value = NUMBER_WORDS[m[1].toLowerCase()];
    if (value !== undefined) found.push({ raw: m[1], value });
  }
  return found;
}

const urlKey = (url: string) => url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/.,;:!?]+$/, '');

/** Everything a claim may be backed by. */
export type FactSources = { text: string; words: Set<string>; numbers: Set<number> };

export function factSources(parts: Array<string | null | undefined | false>): FactSources {
  const text = parts.filter(Boolean).join('\n').toLowerCase();
  return {
    text,
    words: new Set(text.match(/[\p{L}\p{N}][\p{L}\p{N}&'’.+#-]*/gu)?.map((w) => w.replace(/[.'’]+$/, '')) ?? []),
    numbers: new Set(numbersIn(text).map((n) => n.value)),
  };
}

/** Where sentences start: capitals there are grammar, not names. */
function sentenceStarts(text: string): Set<number> {
  const starts = new Set<number>([0]);
  for (const m of text.matchAll(/(?:[.!?:;]["”’)]?\s+|\n)\s*(?:[-*•·]\s+)?(?=\S)/g)) starts.add(m.index + m[0].length);
  return starts;
}

/** German capitalises every noun, so in German text only acronyms count as names. */
function looksGerman(text: string): boolean {
  const hits = text.match(/\b(und|ich|die|der|das|mit|für|nicht|Sie|Ihre[nm]?)\b/g)?.length ?? 0;
  return hits >= 4;
}

/**
 * What in `text` the sources don't back: names and acronyms, numbers (years, percentages,
 * money), links and credentials. In order, once each.
 */
export function unverifiedFacts(input: string, sources: FactSources): string[] {
  const flags: string[] = [];
  const flag = (value: string) => { if (!flags.includes(value)) flags.push(value); };

  let text = input.replace(PLACEHOLDER, ' ');

  // Links first, whole: their pieces aren't names or numbers.
  for (const m of text.matchAll(URL)) {
    const key = urlKey(m[0]);
    if (!sources.text.includes(key)) flag(m[0].replace(/[.,;:!?]+$/, ''));
  }
  text = text.replace(URL, ' ');

  // Names: capitalised words that don't start a sentence, and acronyms anywhere.
  const german = looksGerman(text);
  const starts = sentenceStarts(text);
  for (const m of text.matchAll(/[\p{Lu}][\p{L}\p{N}&'’+#-]*/gu)) {
    const word = m[0].replace(/['’]s$/, '').replace(/[-'’]+$/, '');
    const lower = word.toLowerCase();
    const acronym = (word.match(/\p{Lu}/gu)?.length ?? 0) >= 2;
    if (!acronym && (german || starts.has(m.index))) continue;
    if (SKIP_WORDS.has(lower)) continue;
    // Short words only as whole words: "AI" must not pass because "maintain" is there.
    if (sources.words.has(lower) || (lower.length >= 4 && sources.text.includes(lower))) continue;
    flag(word);
  }

  // Numbers, however they're formatted.
  for (const n of numbersIn(text)) {
    if (sources.numbers.has(n.value)) continue;
    // "one of the…", "two weeks" aren't claims worth checking.
    if (/^[a-z]+$/i.test(n.raw) && n.value <= 2) continue;
    flag(n.raw);
  }

  for (const m of text.matchAll(CREDENTIAL)) {
    if (!sources.text.includes(m[1].toLowerCase().slice(0, 7))) flag(m[1]);
  }
  return flags;
}
