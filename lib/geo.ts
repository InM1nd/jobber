/** Tiny offline gazetteer: enough to tell "Graz" is in Austria. Lowercase keys. */
export const CITY_COUNTRY: Record<string, string> = {
  vienna: 'austria', wien: 'austria', graz: 'austria', linz: 'austria', salzburg: 'austria', innsbruck: 'austria', klagenfurt: 'austria', 'st. pölten': 'austria', wels: 'austria', dornbirn: 'austria', villach: 'austria',
  berlin: 'germany', munich: 'germany', münchen: 'germany', hamburg: 'germany', frankfurt: 'germany', cologne: 'germany', köln: 'germany', stuttgart: 'germany', düsseldorf: 'germany', leipzig: 'germany', dresden: 'germany', hannover: 'germany', nuremberg: 'germany', nürnberg: 'germany', karlsruhe: 'germany', bonn: 'germany', essen: 'germany', dortmund: 'germany', bremen: 'germany', mannheim: 'germany',
  zurich: 'switzerland', zürich: 'switzerland', geneva: 'switzerland', basel: 'switzerland', bern: 'switzerland', lausanne: 'switzerland',
  amsterdam: 'netherlands', rotterdam: 'netherlands', utrecht: 'netherlands', eindhoven: 'netherlands', 'the hague': 'netherlands',
  london: 'united kingdom', manchester: 'united kingdom', edinburgh: 'united kingdom', bristol: 'united kingdom', cambridge: 'united kingdom', dublin: 'ireland', cork: 'ireland',
  paris: 'france', lyon: 'france', toulouse: 'france', madrid: 'spain', barcelona: 'spain', valencia: 'spain', lisbon: 'portugal', porto: 'portugal',
  milan: 'italy', rome: 'italy', turin: 'italy', warsaw: 'poland', krakow: 'poland', kraków: 'poland', wroclaw: 'poland', wrocław: 'poland', gdansk: 'poland',
  prague: 'czechia', brno: 'czechia', budapest: 'hungary', bratislava: 'slovakia', ljubljana: 'slovenia', zagreb: 'croatia', belgrade: 'serbia', bucharest: 'romania', sofia: 'bulgaria',
  stockholm: 'sweden', gothenburg: 'sweden', malmö: 'sweden', copenhagen: 'denmark', oslo: 'norway', helsinki: 'finland', tallinn: 'estonia', riga: 'latvia', vilnius: 'lithuania',
  brussels: 'belgium', antwerp: 'belgium', luxembourg: 'luxembourg', athens: 'greece',
  'new york': 'united states', 'san francisco': 'united states', seattle: 'united states', boston: 'united states', austin: 'united states', chicago: 'united states', toronto: 'canada', bengaluru: 'india', bangalore: 'india', singapore: 'singapore', tokyo: 'japan', sydney: 'australia',
};

export const COUNTRY_ALIASES: Record<string, string[]> = {
  austria: ['austria', 'österreich', ' at ', 'aut'],
  germany: ['germany', 'deutschland', ' de ', 'deu'],
  switzerland: ['switzerland', 'schweiz', ' ch '],
  'united kingdom': ['united kingdom', ' uk ', 'england', 'scotland', ' gb '],
  'united states': ['united states', ' usa ', ' us ', 'u.s.'],
  netherlands: ['netherlands', 'nederland', 'holland', ' nl '],
  czechia: ['czechia', 'czech republic', ' cz '],
};
export const CITY_ALIASES: Record<string, string[]> = {
  vienna: ['vienna', 'wien'], wien: ['vienna', 'wien'], munich: ['munich', 'münchen'], münchen: ['munich', 'münchen'],
  cologne: ['cologne', 'köln'], köln: ['cologne', 'köln'], zurich: ['zurich', 'zürich'], zürich: ['zurich', 'zürich'],
  nuremberg: ['nuremberg', 'nürnberg'], prague: ['prague', 'praha'], warsaw: ['warsaw', 'warszawa'],
};

export const cityTerms = (city?: string | null) => {
  const c = (city || '').trim().toLowerCase();
  return c ? CITY_ALIASES[c] || [c] : [];
};

export function countryTerms(country?: string | null) {
  const c = (country || '').trim().toLowerCase();
  if (!c) return [];
  return [...(COUNTRY_ALIASES[c] || [c]), ...Object.entries(CITY_COUNTRY).filter(([, v]) => v === c).map(([k]) => k)];
}

export const countryOfCity = (city?: string | null) => CITY_COUNTRY[(city || '').trim().toLowerCase()] || null;
