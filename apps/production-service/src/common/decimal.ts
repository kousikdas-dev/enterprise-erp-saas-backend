import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';

const POSITIVE_DECIMAL = /^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,6})?$/;
const NON_NEGATIVE_DECIMAL = /^\d+(?:\.\d{1,6})?$/;
const PERCENT_DECIMAL = /^(?:100(?:\.0{1,2})?|(?:0|[1-9]\d?)(?:\.\d{1,2})?)$/;

export function parsePositiveDecimal(value: unknown): Prisma.Decimal {
  const text = String(value ?? '').trim();
  if (!POSITIVE_DECIMAL.test(text)) {
    throw new BadRequestException('Quantity must be a positive decimal');
  }
  return new Prisma.Decimal(text);
}

/** Unlike parsePositiveDecimal, allows 0 — used for Routing Step timing fields, where a step with no per-unit scaling (e.g. a fixed inspection) legitimately has runMinutesPerUnit of 0. */
export function parseNonNegativeDecimal(value: unknown, label = 'Value'): Prisma.Decimal {
  const text = String(value ?? '').trim();
  if (!NON_NEGATIVE_DECIMAL.test(text)) {
    throw new BadRequestException(`${label} must be a non-negative decimal`);
  }
  return new Prisma.Decimal(text);
}

export function parsePercent(value: unknown): Prisma.Decimal {
  const text = String(value ?? '0').trim();
  if (!PERCENT_DECIMAL.test(text)) {
    throw new BadRequestException(
      'Scrap percentage must be a decimal between 0 and 100 with up to 2 decimal places',
    );
  }
  return new Prisma.Decimal(text);
}

export function quantityToString(value: Prisma.Decimal): string {
  return value.toFixed(6);
}

export function percentToString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}
