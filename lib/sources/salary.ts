export interface SalaryRange {
  min?: number;
  max?: number;
  currency?: string;
}

function amount(raw: string, thousands: boolean): number {
  const n = Number.parseInt(raw.replace(/[.,\s]/g, ''), 10);
  if (!Number.isFinite(n)) return NaN;
  if (thousands || n < 1000) return n * 1000;
  return n;
}

export function parseSalaryRange(summary?: string | null): SalaryRange {
  if (!summary) return {};

  const patterns: Array<{ currency: string; re: RegExp }> = [
    { currency: 'EUR', re: /€\s*(\d[\d.,]*)\s*([kK])?\s*(?:-|–|to)\s*€?\s*(\d[\d.,]*)\s*([kK])?/ },
    { currency: 'USD', re: /\$\s*(\d[\d.,]*)\s*([kK])?\s*(?:-|–|to)\s*\$?\s*(\d[\d.,]*)\s*([kK])?/ },
    { currency: 'GBP', re: /£\s*(\d[\d.,]*)\s*([kK])?\s*(?:-|–|to)\s*£?\s*(\d[\d.,]*)\s*([kK])?/ },
  ];

  for (const pattern of patterns) {
    const match = summary.match(pattern.re);
    if (!match) continue;
    const min = amount(match[1], Boolean(match[2]));
    const max = amount(match[3], Boolean(match[4]));
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
    return { min, max, currency: pattern.currency };
  }

  return {};
}
