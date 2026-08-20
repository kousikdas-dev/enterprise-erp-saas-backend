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

function toScaledBigInt(
  value: string,
  scale: number,
): { sign: bigint; abs: bigint } | null {
  const match = String(value).trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return null;
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const frac = (match[3] ?? '').padEnd(scale, '0').slice(0, scale);
  return { sign: BigInt(sign), abs: BigInt(match[2] + frac) };
}

function fromScaledBigInt(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const raw = abs.toString().padStart(scale + 1, '0');
  const intPart = raw.slice(0, -scale) || '0';
  const frac = raw.slice(-scale);
  return `${sign}${intPart}.${frac}`;
}

/** Display-only multiply using fixed-scale integer math (no float). */
export function multiplyDecimals(
  a: string,
  b: string,
  outScale = 4,
): string {
  const left = toScaledBigInt(a, 6);
  const right = toScaledBigInt(b, 6);
  if (!left || !right) {
    return '—';
  }
  const product = left.sign * right.sign * left.abs * right.abs;
  // product scale = 12; shift to outScale
  const shift = 12 - outScale;
  const rounded = product / 10n ** BigInt(shift);
  return fromScaledBigInt(rounded, outScale);
}

/** Display-only subtract using 6dp integer math. */
export function subtractDecimals(a: string, b: string): string {
  const left = toScaledBigInt(a, 6);
  const right = toScaledBigInt(b, 6);
  if (!left || !right) {
    return '—';
  }
  const result = left.sign * left.abs - right.sign * right.abs;
  return fromScaledBigInt(result, 6);
}

export function isPositiveDecimal(value: string): boolean {
  const parsed = toScaledBigInt(value, 6);
  return !!parsed && parsed.sign > 0n && parsed.abs > 0n;
}
