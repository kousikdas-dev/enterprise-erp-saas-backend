/** Matches Gateway purchase DTOs — do not invent fields. */

export interface Supplier {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierRequest {
  code: string;
  name: string;
  address?: string;
}

export interface UpdateSupplierRequest {
  code?: string;
  name?: string;
  address?: string;
  isActive?: boolean;
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
  receivedQuantity: string;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  supplierId: string;
  status: PurchaseOrderStatus | string;
  notes: string | null;
  items: PurchaseOrderItem[];
}

export interface PurchaseOrderLineInput {
  productId: string;
  quantity: string;
  unitCost: string;
}

export interface CreatePurchaseOrderRequest {
  supplierId: string;
  notes?: string;
  items: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderRequest {
  supplierId?: string;
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
