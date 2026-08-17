export const EVENT_EXCHANGE = 'erp.events';

export const DomainEvent = {
  SalesOrderCreated: 'sales.order.created',
  SalesInvoicePosted: 'sales.invoice.posted',
  InventoryStockReserved: 'inventory.stock.reserved',
  InventoryStockChanged: 'inventory.stock.changed',
  InventoryGoodsReceived: 'inventory.goods.received',
  AccountingJournalPosted: 'accounting.journal.posted',
  IdentityUserCreated: 'identity.user.created',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];
