import { BadRequestException } from '@nestjs/common';
import {
  moneyToString,
  parseMoney,
  parsePositiveDecimal,
  quantityToString,
} from './decimal';

describe('sales decimal helpers', () => {
  it('parses and formats quantities to 6dp', () => {
    const value = parsePositiveDecimal('10');
    expect(quantityToString(value)).toBe('10.000000');
  });

  it('parses and formats money to 4dp', () => {
    const value = parseMoney('19.99');
    expect(moneyToString(value)).toBe('19.9900');
  });

  it('rejects non-positive quantities', () => {
    expect(() => parsePositiveDecimal('0')).toThrow(BadRequestException);
  });
});
