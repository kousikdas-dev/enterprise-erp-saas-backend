import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';

const POSITIVE_DECIMAL = /^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,6})?$/;
const MONEY_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const PERCENT_DECIMAL = /^(?:100(?:\.0{1,2})?|(?:0|[1-9]\d?)(?:\.\d{1,2})?)$/;

export function parsePositiveDecimal(value: unknown): Prisma.Decimal {
  const text = String(value ?? '').trim();
  if (!POSITIVE_DECIMAL.test(text)) {
    throw new BadRequestException('Quantity must be a positive decimal');
  }
  return new Prisma.Decimal(text);
}

export function parseMoney(value: unknown): Prisma.Decimal {
  const text = String(value ?? '').trim();
  if (!MONEY_DECIMAL.test(text)) {
    throw new BadRequestException('Price must be a non-negative decimal');
  }
  return new Prisma.Decimal(text);
}

export function parsePercent(value: unknown): Prisma.Decimal {
  const text = String(value ?? '0').trim();
  if (!PERCENT_DECIMAL.test(text)) {
    throw new BadRequestException(
      'Discount percent must be a decimal between 0 and 100 with up to 2 decimal places',
    );
  }
  return new Prisma.Decimal(text);
}

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export function moneyToString(value: Prisma.Decimal): string {
  return value.toFixed(4);
}

export function quantityToString(value: Prisma.Decimal): string {
  return value.toFixed(6);
}
