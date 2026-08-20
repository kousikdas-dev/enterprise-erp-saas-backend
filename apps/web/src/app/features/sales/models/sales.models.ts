/** Matches Gateway sales DTO shapes — do not invent fields. */

export interface Customer {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerRequest {
  code: string;
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
}

export interface UpdateCustomerRequest {
  code?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  isActive?: boolean;
}

export type QuotationStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED';

export interface QuotationItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface Quotation {
  id: string;
  tenantId: string;
  customerId: string;
  status: QuotationStatus | string;
  customerName: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  notes: string | null;
  subtotal: string;
  total: string;
  items: QuotationItem[];
}

export interface QuotationLineInput {
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

export interface CreateQuotationRequest {
  customerId: string;
  notes?: string;
  validUntil?: string;
  billingAddress?: string;
  shippingAddress?: string;
  items: QuotationLineInput[];
}

export interface UpdateQuotationRequest {
  customerId?: string;
  notes?: string;
  validUntil?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  items?: QuotationLineInput[];
}

export interface ProformaInvoiceItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface ProformaInvoice {
  id: string;
  tenantId: string;
  documentNumber: string;
  sourceType: string;
  sourceId: string;
  status: string;
  customerId: string;
  customerName: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  notes: string | null;
  subtotal: string;
  total: string;
  items: ProformaInvoiceItem[];
}

export type SalesOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'CANCELLED';

export interface SalesOrderItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  orderedQuantity: string;
  shippedQuantity: string;
  remainingQuantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface SalesOrder {
  id: string;
  tenantId: string;
  customerId: string;
  quotationId: string | null;
  status: SalesOrderStatus | string;
  customerName: string;
  notes: string | null;
  subtotal: string;
  total: string;
  items: SalesOrderItem[];
}

export interface CreateSalesOrderRequest {
  customerId: string;
  notes?: string;
  billingAddress?: string;
  shippingAddress?: string;
  items: QuotationLineInput[];
}

export interface UpdateSalesOrderRequest {
  customerId?: string;
  notes?: string;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  items?: QuotationLineInput[];
}

export type ShipmentStatus = 'PENDING_STOCK' | 'POSTED';

export interface ShipmentItem {
  id: string;
  salesOrderItemId: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  warehouseId: string;
}

export interface Shipment {
  id: string;
  tenantId: string;
  salesOrderId: string;
  warehouseId: string;
  status: ShipmentStatus | string;
  items: ShipmentItem[];
}

export interface CreateShipmentLineRequest {
  salesOrderItemId: string;
  quantity: string;
}

export interface CreateShipmentRequest {
  salesOrderId: string;
  warehouseId: string;
  items: CreateShipmentLineRequest[];
}

export interface ItemList<T> {
  items: T[];
}
