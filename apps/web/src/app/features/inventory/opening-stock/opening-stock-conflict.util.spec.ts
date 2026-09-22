import { activeOpeningStockLabel } from './opening-stock-conflict.util';

describe('activeOpeningStockLabel', () => {
  it('prefers the human-readable document number over the raw UUID', () => {
    expect(
      activeOpeningStockLabel({
        productId: 'p1',
        warehouseId: 'w1',
        activeOpeningStockId: '654ba771-ac6d-4cf5-925d-20edb3316b17',
        activeOpeningStockDocumentNumber: 'OB-00000001',
      }),
    ).toBe('OB-00000001');
  });

  it('falls back to the raw UUID if the document number is missing', () => {
    expect(
      activeOpeningStockLabel({
        productId: 'p1',
        warehouseId: 'w1',
        activeOpeningStockId: '654ba771-ac6d-4cf5-925d-20edb3316b17',
        activeOpeningStockDocumentNumber: '',
      }),
    ).toBe('654ba771-ac6d-4cf5-925d-20edb3316b17');
  });
});
