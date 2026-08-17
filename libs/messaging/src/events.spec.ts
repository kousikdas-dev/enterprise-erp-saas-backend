import { DomainEvent } from './events';

describe('DomainEvent', () => {
  it('keeps accounting-related sales events in the contract catalog', () => {
    expect(DomainEvent.SalesInvoicePosted).toBe('sales.invoice.posted');
    expect(DomainEvent.AccountingJournalPosted).toBe('accounting.journal.posted');
  });
});
