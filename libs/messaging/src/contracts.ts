import { DomainEventName } from './events';

export interface DomainEventEnvelope<TPayload> {
  eventId: string;
  eventName: DomainEventName | string;
  tenantId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface SalesInvoicePostedPayload {
  invoiceId: string;
  tenantId: string;
  customerId: string;
  currency: string;
  totalAmount: string;
}

export interface InventoryStockChangedPayload {
  itemId: string;
  tenantId: string;
  warehouseId: string;
  quantityDelta: string;
}

export interface AccountingJournalPostedPayload {
  journalId: string;
  tenantId: string;
  sourceService: string;
  sourceId: string;
}
