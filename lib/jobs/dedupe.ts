export function makeDedupeKey(company: string, title: string, location?: string | null): string {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // "(m/w/d)", "*in", ":in" etc. differ between platforms for the same ad.
  const cleanTitle = title.replace(/\((?:[mwdfx][/|,\s]*){2,}\)/gi, '').replace(/[*:]in\b/gi, '');
  const cleanCompany = company.replace(/\b(gmbh|ag|kg|og|e\.?u\.?|ltd|inc|se)\b\.?/gi, '');
  const firstPlace = norm(location || '').split(' ')[0];
  return `${norm(cleanCompany)}|${norm(cleanTitle)}|${norm(firstPlace)}`;
}

const TRACKING = /^(utm_|gclid|fbclid|ref|refid|trk|src|source|mc_)/i;
export function normalizeUrl(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const q = u.searchParams.toString();
    return `url:${host}${path}${q ? '?' + q : ''}`;
  } catch {
    return null;
  }
}
export function isGenericCareersUrl(key: string | null) {
  if (!key) return false;
  const path = key.replace(/^url:[^/?]+/, '').split('?')[0].toLowerCase();
  return path === '' || /\/(careers?|jobs?|karriere|stellen(angebote)?|join(-us)?|work-with-us|open-positions)$/.test(path);
}

/**
 * The link as a dedupe key: the same posting reached through two boards (or with tracking
 * parameters) is one job. Null for generic careers pages and links shared by several roles.
 * Idea from AienTech/dossier (agent dedupe key).
 */
export function jobUrlKey(url: string | null | undefined, sourceType?: string): string | null {
  if (sourceType === 'hackernews' || sourceType === 'manual') return null; // one HN post = several roles at one link
  const key = normalizeUrl(url);
  if (!key || isGenericCareersUrl(key)) return null;
  // Pages that list many jobs at one address (search results, RSS) aren't one posting.
  if (/[?&](q|query|search|keywords?)=/i.test(key)) return null;
  return key;
}
