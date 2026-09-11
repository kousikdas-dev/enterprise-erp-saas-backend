import { proformaSourceLabel } from './proforma-source.util';

describe('proformaSourceLabel', () => {
  it('labels a quotation source', () => {
    expect(proformaSourceLabel('QUOTATION')).toBe('Quotation');
  });

  it('labels a sales order source', () => {
    expect(proformaSourceLabel('SALES_ORDER')).toBe('Sales Order');
  });

  it('falls back safely for an unexpected/missing source type', () => {
    expect(proformaSourceLabel('')).toBe('No source document');
    expect(proformaSourceLabel('SOMETHING_ELSE')).toBe('No source document');
  });
});
