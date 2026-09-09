/** Matches Gateway sales DTO shapes — do not invent fields. */

export interface Customer {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  jobPosition: string | null;
  website: string | null;
  tags: string[];
  gstin: string | null;
  salespersonId: string | null;
  paymentTermId: string | null;
  paymentMethodId: string | null;
  fiscalPositionId: string | null;
  industryId: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  state: string | null;
  country: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  addresses?: CustomerAddress[];
}

export interface CreateCustomerRequest {
  code: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  jobPosition?: string;
  website?: string;
  tags?: string[];
  gstin?: string;
  salespersonId?: string;
  paymentTermId?: string;
  paymentMethodId?: string;
  fiscalPositionId?: string;
  industryId?: string;
  street?: string;
  street2?: string;
  city?: string;
  zip?: string;
  state?: string;
  country?: string;
}

export interface UpdateCustomerRequest {
  code?: string;
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  jobPosition?: string | null;
  website?: string | null;
  tags?: string[];
  gstin?: string | null;
  salespersonId?: string | null;
  paymentTermId?: string | null;
  paymentMethodId?: string | null;
  fiscalPositionId?: string | null;
  industryId?: string | null;
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  zip?: string | null;
  state?: string | null;
  country?: string | null;
  isActive?: boolean;
}

export type CustomerAddressType = 'BILLING' | 'SHIPPING';

export interface CustomerAddress {
  id: string;
  customerId: string;
  type: CustomerAddressType;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerAddressRequest {
  type: CustomerAddressType;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  phone?: string;
  isDefault?: boolean;
}

export interface UpdateCustomerAddressRequest {
  type?: CustomerAddressType;
  name?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string | null;
  postalCode?: string | null;
  country?: string;
  phone?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}

export type QuotationStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED';

export interface QuotationItemTaxComponent {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: string;
  componentTaxAmount: string;
}

export interface QuotationItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: string | null;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  taxComponents: QuotationItemTaxComponent[];
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
  paymentTermId: string | null;
  salespersonId: string | null;
  deliveryDate: string | null;
  validUntil: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  items: QuotationItem[];
}

/** Shared by proforma invoices, sales invoices, and sales orders — do not add fields required only by quotations here. */
export interface QuotationLineInput {
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

/** Quotation-only line input: adds UOM/discount/tax on top of the shared QuotationLineInput shape. */
export interface QuotationItemInput extends QuotationLineInput {
  unitOfMeasureId: string;
  discountPercent?: string;
  taxCodeId?: string;
}

export interface CreateQuotationRequest {
  customerId: string;
  notes?: string;
  validUntil?: string;
  billingAddress?: string;
  shippingAddress?: string;
  paymentTermId?: string;
  salespersonId?: string;
  deliveryDate?: string;
  items: QuotationItemInput[];
}

export interface UpdateQuotationRequest {
  customerId?: string;
  notes?: string;
  validUntil?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  paymentTermId?: string | null;
  salespersonId?: string | null;
  deliveryDate?: string | null;
  items?: QuotationItemInput[];
}

export type ProformaInvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

export interface ProformaInvoiceItemTaxComponent {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: string;
  componentTaxAmount: string;
}

export interface ProformaInvoiceItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: string | null;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  taxComponents: ProformaInvoiceItemTaxComponent[];
}

export interface ProformaInvoice {
  id: string;
  tenantId: string;
  documentNumber: string;
  sourceType: string;
  sourceId: string;
  status: ProformaInvoiceStatus | string;
  customerId: string;
  customerName: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  notes: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  items: ProformaInvoiceItem[];
}

export interface UpdateProformaInvoiceRequest {
  notes?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  items?: QuotationLineInput[];
}

/** Optional overrides for the /sales-orders/:id/invoice and /proforma-invoices/:id/invoice conversion routes. */
export interface CreateInvoiceFromSourceRequest {
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
}

export type SalesOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED';

export interface SalesOrderItemTaxComponent {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: string;
  componentTaxAmount: string;
}

export interface SalesOrderItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  orderedQuantity: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: string | null;
  shippedQuantity: string;
  remainingQuantity: string;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  taxComponents: SalesOrderItemTaxComponent[];
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
  discountTotal: string;
  taxTotal: string;
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

export type SalesInvoiceStatus = 'DRAFT' | 'SENT' | 'CANCELLED';

export type SalesInvoicePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface SalesInvoiceItemTaxComponent {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: string;
  componentTaxAmount: string;
}

export interface SalesInvoiceItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: string | null;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  taxComponents: SalesInvoiceItemTaxComponent[];
}

export interface SalesInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  sourceType: string | null;
  sourceId: string | null;
  status: SalesInvoiceStatus | string;
  customerId: string;
  customerName: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  paymentTermId: string | null;
  salespersonId: string | null;
  invoiceDate: string;
  dueDate: string | null;
  notes: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  paymentStatus: SalesInvoicePaymentStatus | string;
  sentAt: string | null;
  items: SalesInvoiceItem[];
}

export interface SalesPayment {
  id: string;
  salesInvoiceId: string;
  amount: string;
  paymentDate: string;
  paymentMethodId: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalesPaymentRequest {
  amount: string;
  paymentDate: string;
  paymentMethodId?: string;
  reference?: string;
  notes?: string;
}

export interface RecordSalesPaymentResult {
  payment: SalesPayment;
  invoice: SalesInvoice;
}

export interface CreateSalesInvoiceRequest {
  customerId: string;
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
  billingAddress?: string;
  shippingAddress?: string;
  paymentTermId?: string;
  salespersonId?: string;
  items: QuotationLineInput[];
}

export interface UpdateSalesInvoiceRequest {
  customerId?: string;
  invoiceDate?: string;
  dueDate?: string | null;
  notes?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  paymentTermId?: string | null;
  salespersonId?: string | null;
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
