/**
 * Format inventory quantities for display (6 decimal places).
 * Uses string padding — avoids float arithmetic on quantity values.
 */
export function formatQuantity(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '0.000000';
  }
  const raw = String(value).trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return raw;
  }
  const sign = match[1];
  const intPart = match[2];
  const frac = (match[3] ?? '').padEnd(6, '0').slice(0, 6);
  return `${sign}${intPart}.${frac}`;
}

/** Display price/decimal strings as returned (no float conversion). */
export function formatDecimal(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
}
