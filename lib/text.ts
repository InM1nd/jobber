export function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatMoney(amount?: number | null, currency = 'EUR'): string | null {
  if (amount == null) return null;
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatSalaryRange(
  min?: number | null,
  max?: number | null,
  currency = 'EUR',
): string | null {
  const left = formatMoney(min, currency);
  const right = formatMoney(max, currency);
  if (left && right) return `${left}–${right}`;
  if (left) return `from ${left}`;
  if (right) return `up to ${right}`;
  return null;
}
