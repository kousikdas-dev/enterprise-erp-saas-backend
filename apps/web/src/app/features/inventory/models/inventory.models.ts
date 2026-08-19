/** Matches Gateway inventory DTO shapes — do not invent fields. */

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  unitOfMeasureId: string;
  sellingPrice: string;
  costPrice: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductRequest {
  sku: string;
  name: string;
  description?: string;
  categoryId: string;
  unitOfMeasureId: string;
  sellingPrice: string;
  costPrice: string;
}

export interface UpdateProductRequest {
  sku?: string;
  name?: string;
  description?: string;
  categoryId?: string;
  unitOfMeasureId?: string;
  sellingPrice?: string;
  costPrice?: string;
  isActive?: boolean;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface Unit {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUnitRequest {
  code: string;
  name: string;
}

export interface UpdateUnitRequest {
  code?: string;
  name?: string;
  isActive?: boolean;
}

export interface Warehouse {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseRequest {
  code: string;
  name: string;
  address?: string;
}

export interface UpdateWarehouseRequest {
  code?: string;
  name?: string;
  address?: string;
  isActive?: boolean;
}

export type StockAdjustmentType =
  | 'OPENING'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export type StockMovementType =
  | 'OPENING'
  | 'PURCHASE'
  | 'SALE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export const STOCK_ADJUSTMENT_TYPES: readonly StockAdjustmentType[] = [
  'OPENING',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
] as const;

export const STOCK_MOVEMENT_TYPES: readonly StockMovementType[] = [
  'OPENING',
  'PURCHASE',
  'SALE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
] as const;

export interface StockBalance {
  id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockQuery {
  productId?: string;
  warehouseId?: string;
}

export interface CreateStockAdjustmentRequest {
  productId: string;
  warehouseId: string;
  type: StockAdjustmentType;
  quantity: string;
  reason?: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface StockMovementQuery {
  productId?: string;
  warehouseId?: string;
  type?: StockMovementType;
  from?: string;
  to?: string;
}

export interface StockAdjustmentResult {
  stock: StockBalance;
  movement: StockMovement;
}

export interface ItemList<T> {
  items: T[];
}
