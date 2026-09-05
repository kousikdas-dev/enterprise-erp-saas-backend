import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';

const MONEY_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

/**
 * Only string/number/bigint inputs have a meaningful, safe string
 * representation for a money amount. Anything else (object, array,
 * boolean, null, undefined) is not a valid amount and must not be passed
 * through the default Object stringification — it is rejected as empty,
 * which then fails the MONEY_DECIMAL format check below.
 */
function toAmountText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

export function parseMoney(value: unknown): Prisma.Decimal {
  const text = toAmountText(value).trim();
  if (!MONEY_DECIMAL.test(text)) {
    throw new BadRequestException('Amount must be a non-negative decimal');
  }
  return new Prisma.Decimal(text);
}

export function moneyToString(value: Prisma.Decimal): string {
  return value.toFixed(4);
}

const RATE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

/**
 * Tax component rates are percentages: 0–100 inclusive, up to 4 decimal
 * places. The regex alone (shared shape with parseMoney) has no upper bound
 * and no minus sign, so the 100 ceiling is checked separately after parsing.
 */
export function parseRate(value: unknown): Prisma.Decimal {
  const text = toAmountText(value).trim();
  if (!RATE_DECIMAL.test(text)) {
    throw new BadRequestException(
      'Rate must be a non-negative decimal with up to 4 decimal places',
    );
  }
  const rate = new Prisma.Decimal(text);
  if (rate.greaterThan(100)) {
    throw new BadRequestException('Rate must not exceed 100');
  }
  return rate;
}

export function rateToString(value: Prisma.Decimal): string {
  return value.toFixed(4);
}
