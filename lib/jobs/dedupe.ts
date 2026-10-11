export function makeDedupeKey(company: string, title: string, location?: string | null): string {
  const norm = (value: string) =>
    value
      .toLowerCase()
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
