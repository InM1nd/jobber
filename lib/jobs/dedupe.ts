export function makeDedupeKey(company: string, title: string, location?: string | null): string {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  return `${norm(company)}|${norm(title)}|${norm(location || '')}`;
}
