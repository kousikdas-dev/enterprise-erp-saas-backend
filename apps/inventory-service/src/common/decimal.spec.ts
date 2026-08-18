import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import {
  decimalToString,
  moneyToString,
  parseMoney,
  parsePositiveDecimal,
  quantityToString,
} from './decimal';

describe('decimal helpers', () => {
  it('parses money and quantity as Prisma Decimal strings', () => {
    expect(decimalToString(parseMoney('19.99'))).toBe('19.99');
    expect(moneyToString(parseMoney('19.99'))).toBe('19.9900');
    expect(quantityToString(parsePositiveDecimal('10.5'))).toBe('10.500000');
    expect(parseMoney('1.25')).toBeInstanceOf(Prisma.Decimal);
  });

  it('rejects invalid money and non-positive quantity', () => {
    expect(() => parseMoney('1.23456')).toThrow(BadRequestException);
    expect(() => parsePositiveDecimal('0')).toThrow(BadRequestException);
    expect(() => parsePositiveDecimal('-1')).toThrow(BadRequestException);
  });
});
