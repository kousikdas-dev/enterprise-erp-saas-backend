/** Matches Gateway production DTOs — do not invent fields. */

export type BomStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export const BOM_STATUSES: readonly BomStatus[] = [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
] as const;

export interface BomItem {
  id: string;
  componentProductId: string;
  componentProductSku: string;
  componentProductName: string;
  quantity: string;
  unitOfMeasureId: string;
  uomCode: string;
  uomName: string;
  scrapPercentage: string | null;
  sequence: number;
}

export interface Bom {
  id: string;
  tenantId: string;
  parentProductId: string;
  parentProductSku: string;
  parentProductName: string;
  bomQuantity: string;
  outputUnitOfMeasureId: string;
  outputUomCode: string;
  outputUomName: string;
  version: number;
  status: BomStatus | string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
  items: BomItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BomItemLineInput {
  componentProductId: string;
  quantity: string;
  unitOfMeasureId: string;
  scrapPercentage?: string;
  sequence: number;
}

export interface CreateBomRequest {
  parentProductId: string;
  bomQuantity: string;
  outputUnitOfMeasureId: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  notes?: string;
  items: BomItemLineInput[];
}

export interface UpdateBomRequest {
  bomQuantity?: string;
  outputUnitOfMeasureId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  notes?: string;
  items?: BomItemLineInput[];
}

export interface Operation {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOperationRequest {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateOperationRequest {
  code?: string;
  name?: string;
  description?: string;
}

export interface WorkCentre {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkCentreRequest {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateWorkCentreRequest {
  code?: string;
  name?: string;
  description?: string;
}

export type ProductionOrderStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'RELEASED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'CLOSED';

export const PRODUCTION_ORDER_STATUSES: readonly ProductionOrderStatus[] = [
  'DRAFT',
  'PLANNED',
  'RELEASED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'CLOSED',
] as const;

export type ProductionOrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const PRODUCTION_ORDER_PRIORITIES: readonly ProductionOrderPriority[] = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
] as const;

export interface ProductionOrder {
  id: string;
  tenantId: string;
  orderNumber: string;
  productId: string;
  productSku: string;
  productName: string;
  bomId: string;
  bomVersion: number;
  routingId: string | null;
  routingVersion: number | null;
  plannedQuantity: string;
  outputUnitOfMeasureId: string;
  outputUomCode: string;
  outputUomName: string;
  orderDate: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  warehouseId: string | null;
  priority: ProductionOrderPriority | string;
  status: ProductionOrderStatus | string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionOrderRequest {
  productId: string;
  bomId: string;
  plannedQuantity: string;
  outputUnitOfMeasureId: string;
  warehouseId?: string;
  priority?: ProductionOrderPriority;
  orderDate: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  notes?: string;
}

export interface UpdateProductionOrderRequest {
  productId?: string;
  bomId?: string;
  plannedQuantity?: string;
  outputUnitOfMeasureId?: string;
  warehouseId?: string;
  priority?: ProductionOrderPriority;
  orderDate?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  notes?: string;
}

export interface ProductionOrderListQuery {
  search?: string;
  status?: ProductionOrderStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductionOrderListResponse {
  items: ProductionOrder[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ItemList<T> {
  items: T[];
}
