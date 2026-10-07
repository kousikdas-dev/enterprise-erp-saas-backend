/** Matches Gateway inventory DTO shapes — do not invent fields. */

export type ProductType = 'GOODS' | 'SERVICE' | 'COMBO';

export const PRODUCT_TYPES: readonly ProductType[] = [
  'GOODS',
  'SERVICE',
  'COMBO',
] as const;

export interface ProductAttributeValueSummary {
  id: string;
  attributeId: string;
  attributeName: string;
  value: string;
}

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
  productType: ProductType;
  trackInventory: boolean;
  barcode: string | null;
  note: string | null;
  /** Marks this product as a variant of a top-level product (null for a template/standalone product). */
  templateProductId: string | null;
  attributeValues: ProductAttributeValueSummary[];
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
  productType?: ProductType;
  trackInventory?: boolean;
  barcode?: string;
  note?: string;
  templateProductId?: string;
  attributeValueIds?: string[];
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
  productType?: ProductType;
  trackInventory?: boolean;
  barcode?: string;
  note?: string;
  templateProductId?: string;
  attributeValueIds?: string[];
}

export interface ProductUnit {
  id: string;
  tenantId: string;
  productId: string;
  unitOfMeasureId: string;
  conversionFactor: string;
  sellingPrice: string;
  costPrice: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductUnitRequest {
  unitOfMeasureId: string;
  conversionFactor: string;
  sellingPrice: string;
  costPrice: string;
  isActive?: boolean;
}

export interface UpdateProductUnitRequest {
  unitOfMeasureId?: string;
  conversionFactor?: string;
  sellingPrice?: string;
  costPrice?: string;
  isActive?: boolean;
}

export interface RemoveProductUnitResult {
  productId: string;
  id: string;
  removed: boolean;
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
  /** Unit this one converts to — null for a base/reference unit. Must be set together with conversionFactor. */
  referenceUnitId: string | null;
  /** How many of referenceUnit this unit "contains" (decimal string). */
  conversionFactor: string | null;
  referenceUnitCode: string | null;
  referenceUnitName: string | null;
  /** Optional UNSPSC classification. */
  unspscCategoryId: string | null;
  unspscCategoryCode: string | null;
  unspscCategoryName: string | null;
}

export interface CreateUnitRequest {
  code: string;
  name: string;
  referenceUnitId?: string;
  conversionFactor?: string;
  unspscCategoryId?: string;
}

export interface UpdateUnitRequest {
  code?: string;
  name?: string;
  isActive?: boolean;
  referenceUnitId?: string;
  conversionFactor?: string;
  unspscCategoryId?: string;
}

export interface UnspscCategory {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUnspscCategoryRequest {
  code: string;
  name: string;
}

export interface UpdateUnspscCategoryRequest {
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

// OPENING removed from StockAdjustmentType in Inventory Design v4, Phase B —
// opening balances are created exclusively through the dedicated Opening
// Stock feature (see opening-stock.models.ts) now. StockMovementType keeps
// OPENING: it remains a valid, queryable historical movement type.
export type StockAdjustmentType = 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

export type StockMovementType =
  | 'OPENING'
  | 'PURCHASE'
  | 'SALE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export const STOCK_ADJUSTMENT_TYPES: readonly StockAdjustmentType[] = [
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

export type AttributeDisplayType = 'RADIO' | 'SELECT' | 'COLOR' | 'PILLS';

export const ATTRIBUTE_DISPLAY_TYPES: readonly AttributeDisplayType[] = [
  'RADIO',
  'SELECT',
  'COLOR',
  'PILLS',
] as const;

export type AttributeVariantCreation = 'INSTANTLY' | 'DYNAMICALLY' | 'NEVER';

export const ATTRIBUTE_VARIANT_CREATIONS: readonly AttributeVariantCreation[] = [
  'INSTANTLY',
  'DYNAMICALLY',
  'NEVER',
] as const;

export interface AttributeValue {
  id: string;
  tenantId: string;
  attributeId: string;
  value: string;
  /** Odoo's "Free text" — a customer-entered placeholder rather than a fixed option. */
  isCustom: boolean;
  extraPrice: string;
  sequence: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attribute {
  id: string;
  tenantId: string;
  name: string;
  displayType: AttributeDisplayType;
  variantCreation: AttributeVariantCreation;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  values?: AttributeValue[];
}

export interface CreateAttributeValueRequest {
  value: string;
  isCustom?: boolean;
  extraPrice?: string;
  sequence?: number;
}

export interface UpdateAttributeValueRequest {
  value?: string;
  isCustom?: boolean;
  extraPrice?: string;
  sequence?: number;
}

export interface CreateAttributeRequest {
  name: string;
  displayType?: AttributeDisplayType;
  variantCreation?: AttributeVariantCreation;
  values?: CreateAttributeValueRequest[];
}

export interface UpdateAttributeRequest {
  name?: string;
  displayType?: AttributeDisplayType;
  variantCreation?: AttributeVariantCreation;
  isActive?: boolean;
}
