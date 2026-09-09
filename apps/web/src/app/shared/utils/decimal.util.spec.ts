import {
  formatQuantity,
  formatDecimal,
  multiplyDecimals,
  percentageOfDecimal,
  subtractDecimals,
  sumDecimals,
  isPositiveDecimal,
} from './decimal.util';

describe('decimal.util', () => {
  describe('formatQuantity', () => {
    it('formats quantity to 6 decimal places', () => {
      expect(formatQuantity('10')).toBe('10.000000');
      expect(formatQuantity('10.5')).toBe('10.500000');
      expect(formatQuantity('10.123456')).toBe('10.123456');
    });

    it('pads missing fractional digits', () => {
      expect(formatQuantity('20.25')).toBe('20.250000');
    });

    it('handles null, undefined and empty values', () => {
      expect(formatQuantity(null)).toBe('0.000000');
      expect(formatQuantity(undefined)).toBe('0.000000');
      expect(formatQuantity('')).toBe('0.000000');
    });
  });

  describe('formatDecimal', () => {
    it('returns the decimal string unchanged', () => {
      expect(formatDecimal('123.4500')).toBe('123.4500');
    });

    it('returns an em dash for empty values', () => {
      const emptyDecimal = String.fromCharCode(0x2014);

      expect(formatDecimal(null)).toBe(emptyDecimal);
      expect(formatDecimal(undefined)).toBe(emptyDecimal);
      expect(formatDecimal('')).toBe(emptyDecimal);
    });
  });

  describe('multiplyDecimals', () => {
    it('multiplies decimal strings without floating-point arithmetic', () => {
      expect(multiplyDecimals('10', '25')).toBe('250.0000');
      expect(multiplyDecimals('2.5', '4')).toBe('10.0000');
    });

    it('uses HALF_UP rounding', () => {
      expect(multiplyDecimals('1.23455', '1')).toBe('1.2346');
      expect(multiplyDecimals('1.23445', '1')).toBe('1.2345');
    });

    it('handles negative values', () => {
      expect(multiplyDecimals('-1.23455', '1')).toBe('-1.2346');
    });

    it('returns an em dash for invalid values', () => {
      expect(multiplyDecimals('abc', '2')).toBe(
        String.fromCharCode(0x2014),
      );
    });
  });

  describe('percentageOfDecimal', () => {
    it('computes a percentage of an amount', () => {
      expect(percentageOfDecimal('100', '9')).toBe('9.0000');
      expect(percentageOfDecimal('200', '18')).toBe('36.0000');
    });

    it('uses HALF_UP rounding', () => {
      // 0.0025 * 9% = 0.000225 -> 4th decimal digit run is ...02|25, rounds down to 0.0002.
      expect(percentageOfDecimal('0.0025', '9')).toBe('0.0002');
      // 0.0025 * 18% = 0.00045 -> ...04|5, rounds up (HALF_UP) to 0.0005.
      expect(percentageOfDecimal('0.0025', '18')).toBe('0.0005');
    });

    it('returns an em dash for invalid values', () => {
      expect(percentageOfDecimal('abc', '9')).toBe(
        String.fromCharCode(0x2014),
      );
    });
  });

  describe('subtractDecimals', () => {
    it('subtracts decimal strings correctly', () => {
      expect(subtractDecimals('100.500000', '20.250000')).toBe(
        '80.250000',
      );
    });

    it('handles negative values', () => {
      expect(subtractDecimals('10', '20')).toBe('-10.000000');
    });

    it('defaults to 6dp output, preserving existing quantity-math callers', () => {
      expect(subtractDecimals('10.500000', '2.250000')).toBe('8.250000');
    });

    it('supports a 4dp output scale for money subtraction', () => {
      expect(subtractDecimals('100.0000', '9.0000', 4)).toBe('91.0000');
    });
  });

  describe('sumDecimals', () => {
    it('sums a list of decimal strings exactly', () => {
      expect(sumDecimals(['1.2500', '2.5000', '0.2500'], 4)).toBe('4.0000');
    });

    it('sums already-rounded tax component amounts without introducing new rounding', () => {
      // Backend rounds each GST component independently, then sums the rounded amounts.
      expect(sumDecimals(['0.0002', '0.0002'], 4)).toBe('0.0004');
    });

    it('returns 0 at the requested scale for an empty list', () => {
      expect(sumDecimals([], 4)).toBe('0.0000');
    });

    it('handles negative values', () => {
      expect(sumDecimals(['10.0000', '-3.0000'], 4)).toBe('7.0000');
    });

    it('returns an em dash for invalid values', () => {
      expect(sumDecimals(['1.0000', 'abc'], 4)).toBe(
        String.fromCharCode(0x2014),
      );
    });
  });

  describe('GST18-style independent component rounding (CGST 9% + SGST 9%)', () => {
    it('rounds each tax component independently rather than combining rates first', () => {
      const lineSubtotal = '0.0025';

      const cgst = percentageOfDecimal(lineSubtotal, '9');
      const sgst = percentageOfDecimal(lineSubtotal, '9');
      const correctTaxAmount = sumDecimals([cgst, sgst], 4);

      const incorrectCombinedTaxAmount = percentageOfDecimal(
        lineSubtotal,
        '18',
      );

      expect(cgst).toBe('0.0002');
      expect(sgst).toBe('0.0002');
      expect(correctTaxAmount).toBe('0.0004');
      // Summing two independently-rounded 9% components must NOT equal
      // rounding a single combined 18% rate — this is the exact discrepancy
      // the frontend preview must avoid.
      expect(incorrectCombinedTaxAmount).toBe('0.0005');
      expect(correctTaxAmount).not.toBe(incorrectCombinedTaxAmount);
    });
  });

  describe('isPositiveDecimal', () => {
    it('returns true for positive values', () => {
      expect(isPositiveDecimal('10')).toBeTrue();
      expect(isPositiveDecimal('0.000001')).toBeTrue();
    });

    it('returns false for zero, negative and invalid values', () => {
      expect(isPositiveDecimal('0')).toBeFalse();
      expect(isPositiveDecimal('-10')).toBeFalse();
      expect(isPositiveDecimal('abc')).toBeFalse();
    });
  });
});
