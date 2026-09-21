/** Matches Gateway purchase DTOs — do not invent fields. */

export type SupplierAddressType = 'BILLING' | 'DISPATCH';

export interface SupplierAddress {
  id: string;
  supplierId: string;
  type: SupplierAddressType;
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

export interface CreateSupplierAddressRequest {
  type: SupplierAddressType;
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

export interface UpdateSupplierAddressRequest {
  type?: SupplierAddressType;
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

export interface Supplier {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  jobPosition: string | null;
  website: string | null;
  gstin: string | null;
  tags: string[];
  paymentTermId: string | null;
  fiscalPositionId: string | null;
  industryId: string | null;
  notes: string | null;
  /** Legacy free-text address field, retained for compatibility. */
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  addresses?: SupplierAddress[];
}

export interface CreateSupplierRequest {
  code: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  jobPosition?: string;
  website?: string;
  gstin?: string;
  tags?: string[];
  paymentTermId?: string;
  fiscalPositionId?: string;
  industryId?: string;
  notes?: string;
  address?: string;
}

export interface UpdateSupplierRequest {
  code?: string;
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  jobPosition?: string | null;
  website?: string | null;
  gstin?: string | null;
  tags?: string[];
  paymentTermId?: string | null;
  fiscalPositionId?: string | null;
  industryId?: string | null;
  notes?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface PurchaseOrderItemTaxComponent {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: string;
  componentTaxAmount: string;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: string | null;
  unitCost: string;
  discountPercent: string;
  discountAmount: string;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  receivedQuantity: string;
  /** Purchase Invoice V1 accumulator — commercial-UOM quantity billed so far. */
  invoicedQuantity: string;
  taxComponents: PurchaseOrderItemTaxComponent[];
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus | string;
  supplierName: string;
  supplierGstin: string | null;
  supplierBillingAddress: string | null;
  supplierDispatchAddress: string | null;
  supplierBillingAddressId: string | null;
  supplierDispatchAddressId: string | null;
  paymentTermId: string | null;
  /** Identity user reference — not a Master Data entity. */
  buyerId: string | null;
  supplierReference: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  items: PurchaseOrderItem[];
}

export interface PurchaseOrderLineInput {
  productId: string;
  productSku: string;
  productName: string;
  quantity: string;
  unitOfMeasureId: string;
  unitCost: string;
  discountPercent?: string;
  taxCodeId?: string;
}

export interface CreatePurchaseOrderRequest {
  supplierId: string;
  supplierReference?: string;
  expectedDeliveryDate?: string;
  buyerId?: string;
  paymentTermId?: string;
  billingAddressId?: string;
  dispatchAddressId?: string;
  notes?: string;
  items: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderRequest {
  supplierId?: string;
  supplierReference?: string;
  expectedDeliveryDate?: string | null;
  buyerId?: string | null;
  paymentTermId?: string | null;
  billingAddressId?: string;
  dispatchAddressId?: string;
  notes?: string;
  items?: PurchaseOrderLineInput[];
}

export type GoodsReceiptStatus = 'PENDING_STOCK' | 'POSTED';

export interface GoodsReceiptItem {
  id: string;
  purchaseOrderItemId: string;
  /** Commercial/PO UOM receiving quantity — never a base-UOM quantity. */
  quantity: string;
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  /** Historical PO-line conversion factor, frozen at receipt-creation time. */
  conversionFactor: string | null;
  /** quantity × conversionFactor — the value sent to Inventory. Read-only/informational. */
  baseQuantity: string | null;
}

export interface GoodsReceipt {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  warehouseId: string;
  status: GoodsReceiptStatus | string;
  items: GoodsReceiptItem[];
}

export interface CreateGoodsReceiptLineRequest {
  purchaseOrderItemId: string;
  quantity: string;
}

export interface CreateGoodsReceiptRequest {
  purchaseOrderId: string;
  warehouseId: string;
  items: CreateGoodsReceiptLineRequest[];
}

export interface ItemList<T> {
  items: T[];
}

export type PurchaseInvoiceStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
export type PurchaseInvoicePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export type PurchaseInvoicePostingStatus = 'NOT_POSTED' | 'POSTED' | 'FAILED' | 'REVERSED';

export interface PurchaseInvoiceItemTaxComponent {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: string;
  componentTaxAmount: string;
}

export interface PurchaseInvoiceItem {
  id: string;
  purchaseInvoiceId: string;
  purchaseOrderItemId: string;
  /** Optional — ties this line to a specific physical receipt for traceability. */
  goodsReceiptItemId: string | null;
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: string | null;
  /** Commercial UOM quantity actually billed — never a base-UOM quantity. */
  quantity: string;
  unitCost: string;
  discountPercent: string;
  discountAmount: string;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  taxComponents: PurchaseInvoiceItemTaxComponent[];
  /** Three-way matching (flag-only, zero tolerance) — computed on read, never blocks. */
  costMismatch: boolean;
  discountMismatch: boolean;
  taxMismatch: boolean;
}

export interface PurchaseInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  purchaseOrderId: string;
  status: PurchaseInvoiceStatus | string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string | null;
  supplierBillingAddress: string | null;
  paymentTermId: string | null;
  invoiceDate: string;
  dueDate: string | null;
  notes: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  /** Never entered directly — always total - amountPaid, computed server-side. */
  balanceDue: string;
  paymentStatus: PurchaseInvoicePaymentStatus | string;
  confirmedAt: string | null;
  /** Accounting journal posting state — no fallback account, so this can legitimately sit at FAILED until retried. */
  accountingPostingStatus: PurchaseInvoicePostingStatus | string;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseInvoiceItem[];
}

export interface CreatePurchaseInvoiceLineRequest {
  purchaseOrderItemId: string;
  goodsReceiptItemId?: string;
  quantity: string;
  unitCost: string;
  discountPercent?: string;
}

export interface CreatePurchaseInvoiceRequest {
  purchaseOrderId: string;
  supplierInvoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
  items: CreatePurchaseInvoiceLineRequest[];
}

export interface UpdatePurchaseInvoiceRequest {
  supplierInvoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
  items?: CreatePurchaseInvoiceLineRequest[];
}

export interface SupplierPayment {
  id: string;
  purchaseInvoiceId: string;
  amount: string;
  paymentDate: string;
  paymentMethodId: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierPaymentRequest {
  amount: string;
  paymentDate: string;
  paymentMethodId?: string;
  reference?: string;
  notes?: string;
}

export interface RecordSupplierPaymentResult {
  payment: SupplierPayment;
  invoice: PurchaseInvoice;
}
