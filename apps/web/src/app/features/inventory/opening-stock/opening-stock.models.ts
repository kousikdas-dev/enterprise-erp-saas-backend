/** Matches Gateway Opening Stock DTO shapes — do not invent fields. */

export type OpeningStockStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export interface OpeningStockLine {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  unitOfMeasureId: string;
  uomCode: string;
  uomName: string;
  conversionFactor: string;
  baseQuantity: string;
  stockMovementId: string | null;
}

export interface OpeningStock {
  id: string;
  tenantId: string;
  documentNumber: string;
  status: OpeningStockStatus;
  effectiveDate: string;
  postedAt: string | null;
  postedBy: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lines: OpeningStockLine[];
  /** Present only on an idempotent-replay response. */
  code?: 'OPENING_ALREADY_POSTED' | 'OPENING_ALREADY_REVERSED';
}

export interface OpeningStockList {
  items: OpeningStock[];
}

export interface CreateOpeningStockLineRequest {
  productId: string;
  warehouseId: string;
  quantity: string;
  unitOfMeasureId: string;
}

export interface CreateOpeningStockRequest {
  effectiveDate: string;
  notes?: string;
  lines?: CreateOpeningStockLineRequest[];
}

export interface UpdateOpeningStockRequest {
  effectiveDate?: string;
  notes?: string;
}

export interface ReverseOpeningStockRequest {
  reason?: string;
}

export interface OpeningStockQuery {
  status?: OpeningStockStatus;
  productId?: string;
  warehouseId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

/** Machine-readable codes an Opening Stock action can return — never inspect message text for these. */
export const OPENING_STOCK_ERROR_CODES = {
  BLOCKED_EXISTING_STOCK: 'OPENING_BLOCKED_EXISTING_STOCK',
  DUPLICATE_ACTIVE: 'OPENING_DUPLICATE_ACTIVE',
  ALREADY_POSTED: 'OPENING_ALREADY_POSTED',
  ALREADY_REVERSED: 'OPENING_ALREADY_REVERSED',
  NOT_POSTED: 'OPENING_NOT_POSTED',
  REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY: 'OPENING_REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY',
  UOM_NOT_FOUND: 'OPENING_UOM_NOT_FOUND',
  UOM_PRODUCT_MISMATCH: 'OPENING_UOM_PRODUCT_MISMATCH',
  UOM_INVALID_CONVERSION_FACTOR: 'OPENING_UOM_INVALID_CONVERSION_FACTOR',
} as const;

export interface ExistingStockConflictDetail {
  productId: string;
  warehouseId: string;
  existingQuantity: string;
}

export interface DuplicateActiveConflictDetail {
  productId: string;
  warehouseId: string;
  activeOpeningStockId: string;
}

export interface SubsequentActivityConflictDetail {
  productId: string;
  warehouseId: string;
  openingMovementId: string;
  subsequentMovementId: string;
  subsequentMovementType: string;
  subsequentMovementCreatedAt: string;
}
