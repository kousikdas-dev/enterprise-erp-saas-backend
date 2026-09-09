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

/** Display-only multiply using fixed-scale integer math with HALF_UP rounding. */
export function multiplyDecimals(
  a: string,
  b: string,
  outScale = 4,
): string {
  const left = toScaledBigInt(a, 6);
  const right = toScaledBigInt(b, 6);
  if (!left || !right) {
    return String.fromCharCode(0x2014);
  }

  const product = left.sign * right.sign * left.abs * right.abs;

  // product scale = 12; shift to requested output scale
  const shift = 12 - outScale;

  if (shift <= 0) {
    return fromScaledBigInt(
      product * 10n ** BigInt(-shift),
      outScale,
    );
  }

  const divisor = 10n ** BigInt(shift);
  const sign = product < 0n ? -1n : 1n;
  const absProduct = product < 0n ? -product : product;

  // HALF_UP: add half the divisor before integer division.
  const rounded = (absProduct + divisor / 2n) / divisor;

  return fromScaledBigInt(sign * rounded, outScale);
}

/** Display-only percentage calculation using fixed-scale integer math with HALF_UP rounding. */
export function percentageOfDecimal(
  amount: string,
  percent: string,
  outScale = 4,
): string {
  const value = toScaledBigInt(amount, 6);
  const rate = toScaledBigInt(percent, 6);

  if (!value || !rate) {
    return String.fromCharCode(0x2014);
  }

  // amount × percentage
  // Both operands use scale 6, so the product has scale 12.
  const product = value.sign * rate.sign * value.abs * rate.abs;

  // Divide by 100 and round to the requested output scale.
  const shift = 12 - outScale;
  const divisor = 100n * 10n ** BigInt(shift);

  const sign = product < 0n ? -1n : 1n;
  const absProduct = product < 0n ? -product : product;

  // HALF_UP rounding.
  const rounded = (absProduct + divisor / 2n) / divisor;

  return fromScaledBigInt(sign * rounded, outScale);
}

/** Display-only subtract using fixed-scale integer math. Default outScale (6) preserves existing quantity-math callers. */
export function subtractDecimals(a: string, b: string, outScale = 6): string {
  const left = toScaledBigInt(a, 6);
  const right = toScaledBigInt(b, 6);
  if (!left || !right) {
    return '—';
  }
  const result = left.sign * left.abs - right.sign * right.abs;
  // Inputs are parsed at scale 6; rescale the exact result to outScale (no rounding — operands are already at their final precision).
  const shift = 6 - outScale;
  const rescaled =
    shift === 0
      ? result
      : shift > 0
        ? result / 10n ** BigInt(shift)
        : result * 10n ** BigInt(-shift);
  return fromScaledBigInt(rescaled, outScale);
}

/**
 * Display-only sum of decimal strings using fixed-scale integer math.
 * Inputs are assumed already rounded to their final precision (e.g. HALF_UP money
 * amounts from multiplyDecimals/percentageOfDecimal) — summation itself is exact,
 * no additional rounding is applied.
 */
export function sumDecimals(values: string[], outScale = 4): string {
  let total = 0n;
  for (const value of values) {
    const parsed = toScaledBigInt(value, 6);
    if (!parsed) {
      return String.fromCharCode(0x2014);
    }
    total += parsed.sign * parsed.abs;
  }
  const shift = 6 - outScale;
  const rescaled =
    shift === 0 ? total : shift > 0 ? total / 10n ** BigInt(shift) : total * 10n ** BigInt(-shift);
  return fromScaledBigInt(rescaled, outScale);
}

export function isPositiveDecimal(value: string): boolean {
  const parsed = toScaledBigInt(value, 6);
  return !!parsed && parsed.sign > 0n && parsed.abs > 0n;
}
