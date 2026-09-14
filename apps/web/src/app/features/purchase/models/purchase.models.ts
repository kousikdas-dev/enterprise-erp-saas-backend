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
  paymentTermId: string | null;
  /** Identity user reference — not a Master Data entity. */
  buyerId: string | null;
  /** Optional/default receiving warehouse. GoodsReceipt.warehouseId remains the operational destination. */
  warehouseId: string | null;
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
  warehouseId?: string;
  notes?: string;
  items: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderRequest {
  supplierId?: string;
  supplierReference?: string;
  expectedDeliveryDate?: string | null;
  buyerId?: string | null;
  paymentTermId?: string | null;
  warehouseId?: string | null;
  notes?: string;
  items?: PurchaseOrderLineInput[];
}

export type GoodsReceiptStatus = 'PENDING_STOCK' | 'POSTED';

export interface GoodsReceiptItem {
  id: string;
  purchaseOrderItemId: string;
  quantity: string;
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
