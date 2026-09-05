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
