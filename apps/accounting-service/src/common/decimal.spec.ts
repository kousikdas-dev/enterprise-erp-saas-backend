import { BadRequestException } from '@nestjs/common';
import { moneyToString, parseMoney } from './decimal';

describe('accounting decimal helpers', () => {
  it('parses and formats money to 4dp', () => {
    const value = parseMoney('19.99');
    expect(moneyToString(value)).toBe('19.9900');
  });

  it('accepts zero', () => {
    const value = parseMoney('0');
    expect(moneyToString(value)).toBe('0.0000');
  });

  it('rejects negative amounts', () => {
    expect(() => parseMoney('-1')).toThrow(BadRequestException);
  });

  it('rejects more than 4 decimal places', () => {
    expect(() => parseMoney('1.23456')).toThrow(BadRequestException);
  });

  it('is decimal-safe where native floating point would be wrong', () => {
    // 0.1 + 0.2 !== 0.3 under JS floating-point arithmetic.
    expect(0.1 + 0.2 === 0.3).toBe(false);
    const sum = parseMoney('0.10').plus(parseMoney('0.20'));
    expect(sum.equals(parseMoney('0.30'))).toBe(true);
  });
});
