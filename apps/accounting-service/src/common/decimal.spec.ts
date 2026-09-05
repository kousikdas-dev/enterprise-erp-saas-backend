import { BadRequestException } from '@nestjs/common';
import { moneyToString, parseMoney, parseRate, rateToString } from './decimal';

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

  describe('parseRate', () => {
    it('parses and formats a percentage rate to 4dp', () => {
      const value = parseRate('18');
      expect(rateToString(value)).toBe('18.0000');
    });

    it('accepts zero', () => {
      expect(rateToString(parseRate('0'))).toBe('0.0000');
    });

    it('accepts exactly 100', () => {
      expect(rateToString(parseRate('100'))).toBe('100.0000');
    });

    it('rejects a rate above 100', () => {
      expect(() => parseRate('100.0001')).toThrow(BadRequestException);
      expect(() => parseRate('101')).toThrow(BadRequestException);
    });

    it('rejects negative rates', () => {
      expect(() => parseRate('-1')).toThrow(BadRequestException);
    });

    it('rejects more than 4 decimal places', () => {
      expect(() => parseRate('9.12345')).toThrow(BadRequestException);
    });

    it('accepts up to 4 decimal places', () => {
      expect(rateToString(parseRate('9.1234'))).toBe('9.1234');
    });
  });
});
