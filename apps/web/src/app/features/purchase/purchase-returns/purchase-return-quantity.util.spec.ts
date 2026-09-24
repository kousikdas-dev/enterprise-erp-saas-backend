import { remainingReturnableQuantity } from './purchase-return-quantity.util';

describe('purchase-return-quantity.util', () => {
  describe('remainingReturnableQuantity', () => {
    const item = { id: 'gri-1', baseQuantity: '100.000000' };

    it('returns the full baseQuantity when there are no prior returns', () => {
      expect(remainingReturnableQuantity(item, [])).toBe('100.000000');
    });

    it('subtracts a single CONFIRMED return referencing the same line', () => {
      const returns = [
        {
          status: 'CONFIRMED',
          items: [{ goodsReceiptItemId: 'gri-1', baseQuantity: '40.000000' }],
        },
      ];
      expect(remainingReturnableQuantity(item, returns)).toBe('60.000000');
    });

    it('sums multiple CONFIRMED returns against the same line', () => {
      const returns = [
        { status: 'CONFIRMED', items: [{ goodsReceiptItemId: 'gri-1', baseQuantity: '40.000000' }] },
        { status: 'CONFIRMED', items: [{ goodsReceiptItemId: 'gri-1', baseQuantity: '30.000000' }] },
      ];
      expect(remainingReturnableQuantity(item, returns)).toBe('30.000000');
    });

    it('returns zero once the line is fully exhausted', () => {
      const returns = [
        { status: 'CONFIRMED', items: [{ goodsReceiptItemId: 'gri-1', baseQuantity: '100.000000' }] },
      ];
      expect(remainingReturnableQuantity(item, returns)).toBe('0.000000');
    });

    it('ignores DRAFT returns entirely (they have not consumed capacity yet)', () => {
      const returns = [
        { status: 'DRAFT', items: [{ goodsReceiptItemId: 'gri-1', baseQuantity: '40.000000' }] },
      ];
      expect(remainingReturnableQuantity(item, returns)).toBe('100.000000');
    });

    it('ignores lines belonging to a different goods receipt item', () => {
      const returns = [
        { status: 'CONFIRMED', items: [{ goodsReceiptItemId: 'gri-2', baseQuantity: '40.000000' }] },
      ];
      expect(remainingReturnableQuantity(item, returns)).toBe('100.000000');
    });
  });
});
